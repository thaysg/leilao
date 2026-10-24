"""Public, login-free verification of a lot's bid history."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import integrity
from ..models import Bid, Lot, Receipt, WalletTransaction


def verify_lot(db: Session, lot: Lot) -> dict:
    bids = db.execute(select(Bid).where(Bid.lot_id == lot.id).order_by(Bid.seq, Bid.id)).scalars().all()
    issues: list[dict] = []
    bad_seqs: set[int] = set()

    def issue(code: str, message: str, seq: int | None = None):
        issues.append({"code": code, "message": message, "seq": seq})
        if seq is not None:
            bad_seqs.add(seq)

    expected_prev = integrity.genesis_hash(lot)
    expected_seq = 1
    prev_amount: int | None = None
    prev_time = None

    for b in bids:
        if b.seq != expected_seq:
            if b.seq > expected_seq:
                issue("missing_bid", f"Faltam os lances #{expected_seq} a #{b.seq - 1} (removidos do histórico).", b.seq)
            else:
                issue("duplicate_bid", f"Lance #{b.seq} duplicado ou inserido fora da sequência.", b.seq)
            expected_seq = b.seq
        if b.prev_hash != expected_prev:
            issue("chain_broken", f"Lance #{b.seq}: o encadeamento com o lance anterior foi quebrado.", b.seq)
        recomputed = integrity.bid_hash(lot.id, b.seq, b.bidder_id, b.amount_cents, b.created_at,
                                        b.ends_at_after, b.prev_hash)
        if recomputed != b.hash:
            issue("content_altered", f"Lance #{b.seq}: o conteúdo (valor, autor ou horário) foi alterado.", b.seq)
        # Business-rule sanity: even a forged-but-chained row must still obey the rules.
        required = lot.start_price_cents if prev_amount is None else prev_amount + lot.min_increment_cents
        if b.amount_cents < required:
            issue("rule_violation", f"Lance #{b.seq}: valor abaixo do mínimo permitido na ocasião.", b.seq)
        if b.created_at < lot.starts_at:
            issue("rule_violation", f"Lance #{b.seq}: registrado antes do início do lote.", b.seq)
        if prev_time is not None and b.created_at < prev_time:
            issue("rule_violation", f"Lance #{b.seq}: horário anterior ao do lance precedente.", b.seq)
        expected_prev = b.hash
        expected_seq += 1
        prev_amount, prev_time = b.amount_cents, b.created_at

    # Anchors kept on the lot row detect truncation (deleted tail) and wholesale replacement.
    last = bids[-1] if bids else None
    if len(bids) != lot.bid_count:
        issue("count_mismatch", f"O lote registra {lot.bid_count} lance(s), mas o histórico tem {len(bids)}.")
    if (last.hash if last else None) != lot.head_hash:
        issue("head_mismatch", "O último elo do histórico não corresponde ao registrado no lote.")
    if last and (lot.current_cents != last.amount_cents or lot.leader_id != last.bidder_id):
        issue("state_mismatch", "O lance atual/líder do lote não confere com o último lance do histórico.")
    if not last and (lot.current_cents is not None or lot.leader_id is not None):
        issue("state_mismatch", "O lote tem lance atual, mas o histórico está vazio.")
    expected_end = last.ends_at_after if last else lot.original_ends_at
    if lot.ends_at != expected_end:
        issue("end_mismatch", "O horário de término do lote não confere com o histórico (prorrogações).")

    # Settlement cross-check against the wallet ledger and receipt.
    if lot.settled_at and last:
        txs = db.execute(select(WalletTransaction).where(WalletTransaction.lot_id == lot.id)).scalars().all()
        buy = sum(-t.amount_cents for t in txs if t.kind == "purchase" and t.user_id == last.bidder_id)
        sell = sum(t.amount_cents for t in txs if t.kind == "sale" and t.user_id == lot.seller_id)
        if lot.final_cents != last.amount_cents or buy != last.amount_cents or sell != last.amount_cents:
            issue("settlement_mismatch", "A liquidação financeira não confere com o último lance do histórico.")
        rc = db.execute(select(Receipt).where(Receipt.lot_id == lot.id)).scalar_one_or_none()
        if not rc or rc.amount_cents != last.amount_cents or rc.head_hash != last.hash:
            issue("receipt_mismatch", "O comprovante não confere com o histórico de lances.")

    return {
        "intact": not issues,
        "issues": issues,
        "bid_count": len(bids),
        "head_hash": lot.head_hash,
        "genesis_hash": integrity.genesis_hash(lot),
        "bids": [{
            "seq": b.seq, "alias": integrity.alias(lot.id, b.bidder_id), "amount_cents": b.amount_cents,
            "created_at": b.created_at, "hash": b.hash, "prev_hash": b.prev_hash, "ok": b.seq not in bad_seqs,
        } for b in bids],
    }

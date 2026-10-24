import { createBrowserRouter } from 'react-router-dom'
import { AuditPage } from '@/features/audit/presentation/AuditPage'
import { ReceiptPage } from '@/features/audit/presentation/ReceiptPage'
import { LoginPage } from '@/features/auth/presentation/LoginPage'
import { RegisterPage } from '@/features/auth/presentation/RegisterPage'
import { RequireAuth } from '@/features/auth/presentation/RequireAuth'
import { MyBidsPage } from '@/features/bids/presentation/MyBidsPage'
import { WinsPage } from '@/features/bids/presentation/WinsPage'
import { LotRoomPage } from '@/features/lots/presentation/LotRoomPage'
import { ShowcasePage } from '@/features/lots/presentation/ShowcasePage'
import { SellerPanelPage } from '@/features/seller/presentation/SellerPanelPage'
import { WalletPage } from '@/features/wallet/presentation/WalletPage'
import { Layout } from './Layout'
import { NotFoundPage } from './pages/StatusPages'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <ShowcasePage /> },
      { path: '/lotes/:id', element: <LotRoomPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/cadastro', element: <RegisterPage /> },
      { path: '/auditoria/:lotId', element: <AuditPage /> },
      { path: '/comprovante/:code', element: <ReceiptPage /> },
      {
        element: <RequireAuth role="bidder" />,
        children: [
          { path: '/carteira', element: <WalletPage /> },
          { path: '/meus-lances', element: <MyBidsPage /> },
          { path: '/meus-arremates', element: <WinsPage /> },
        ],
      },
      { element: <RequireAuth role="seller" />, children: [{ path: '/painel', element: <SellerPanelPage /> }] },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

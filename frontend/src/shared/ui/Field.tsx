import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

interface FieldProps {
  label: string
  error?: string | null
  hint?: string
  prefix?: string
}

export const Input = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(
  ({ label, error, hint, prefix, id, ...rest }, ref) => {
    const auto = useId()
    const fid = id ?? auto
    const input = (
      <input ref={ref} id={fid} className="input" aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined} {...rest} />
    )
    return (
      <div className="field">
        <label htmlFor={fid}>{label}</label>
        {prefix ? <div className="input-affix"><span aria-hidden>{prefix}</span>{input}</div> : input}
        {error ? <span id={`${fid}-err`} className="error" role="alert">{error}</span>
          : hint ? <span id={`${fid}-hint`} className="hint">{hint}</span> : null}
      </div>
    )
  },
)
Input.displayName = 'Input'

export function Select({ label, children, id, ...rest }: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <select id={fid} className="select" {...rest}>{children}</select>
    </div>
  )
}

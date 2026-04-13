import clsx from 'clsx'

// ─── Button ──────────────────────────────────────────────────────────────────
export function Button({
  children, onClick, variant = 'primary', size = 'md',
  disabled = false, fullWidth = false, className = '', type = 'button',
}) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all active:scale-95 select-none'
  const variants = {
    primary:  'bg-brand-primary text-white hover:bg-red-500',
    secondary:'bg-brand-secondary text-court-bg hover:bg-sky-400',
    ghost:    'bg-white/10 text-white hover:bg-white/20',
    danger:   'bg-red-600 text-white hover:bg-red-700',
    success:  'bg-green-600 text-white hover:bg-green-700',
    warning:  'bg-yellow-500 text-black hover:bg-yellow-400',
    neutral:  'bg-white/20 text-white hover:bg-white/30',
    outline:  'border border-white/30 text-white hover:bg-white/10',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
    xl: 'px-6 py-4 text-lg',
    icon: 'p-2',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        base,
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────
export function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  if (!isOpen) return null
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', full: 'max-w-full mx-4' }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx(
        'relative w-full bg-court-surface rounded-t-2xl sm:rounded-2xl shadow-2xl z-10',
        widths[size],
        'max-h-[90vh] overflow-y-auto',
      )}>
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="text-white font-bold text-lg">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

// ─── Input ───────────────────────────────────────────────────────────────────
export function Input({ label, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm text-gray-300 font-medium">{label}</label>}
      <input
        className={clsx(
          'bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-white',
          'placeholder:text-gray-500 focus:outline-none focus:border-brand-secondary',
          error && 'border-red-500',
          className,
        )}
        {...props}
      />
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}

// ─── Badge ───────────────────────────────────────────────────────────────────
export function Badge({ children, color = '#3b82f6', className = '' }) {
  return (
    <span
      className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold', className)}
      style={{ backgroundColor: color + '33', color }}
    >
      {children}
    </span>
  )
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
export function Spinner({ size = 6 }) {
  return (
    <div
      className={clsx('border-2 border-white/20 border-t-brand-secondary rounded-full animate-spin', `w-${size} h-${size}`)}
    />
  )
}

// ─── Select ──────────────────────────────────────────────────────────────────
export function Select({ label, options, value, onChange, placeholder = 'Seleccionar...', className = '' }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm text-gray-300 font-medium">{label}</label>}
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className={clsx(
          'bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-white',
          'focus:outline-none focus:border-brand-secondary appearance-none',
          className,
        )}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

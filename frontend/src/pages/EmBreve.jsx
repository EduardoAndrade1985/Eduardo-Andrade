export default function EmBreve({ modulo }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-32 text-center fade-up">
      <div className="text-5xl mb-5">🚧</div>
      <h2 className="text-lg font-bold text-primary mb-2">Módulo em desenvolvimento</h2>
      <p className="text-sm text-muted max-w-xs">
        O módulo <strong className="text-dim">{modulo}</strong> está sendo construído
        e estará disponível em breve.
      </p>
    </div>
  )
}

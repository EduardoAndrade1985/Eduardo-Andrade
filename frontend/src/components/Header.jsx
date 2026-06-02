import { useAuth } from '../contexts/AuthContext'

export default function Header({ title }) {
  const { user } = useAuth()

  const inicial = user?.username?.[0]?.toUpperCase() || 'U'
  const dataFmt = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between
                       px-6 bg-bg2 border-b border-border
                       shadow-[0_1px_0_rgba(255,255,255,0.03),0_4px_12px_rgba(0,0,0,0.25)]">

      {/* título com gradiente sutil */}
      <h1 className="text-sm font-semibold tracking-wide
                     bg-gradient-to-r from-primary to-teal-400 bg-clip-text text-transparent">
        {title}
      </h1>

      <div className="flex items-center gap-4">
        {/* data */}
        <span className="hidden sm:block text-[11px] text-muted capitalize tracking-wide">
          {dataFmt}
        </span>

        {/* separador */}
        <div className="hidden sm:block w-px h-4 bg-border"/>

        {/* avatar com gradiente + anel com brilho */}
        <div className="relative group cursor-default">
          <div className="w-8 h-8 rounded-full gradient-primary
                          flex items-center justify-center
                          text-[11px] font-bold text-bg
                          ring-2 ring-primary/30 ring-offset-1 ring-offset-bg2
                          transition-all duration-200
                          group-hover:ring-primary/60 group-hover:glow-sm">
            {inicial}
          </div>
          {/* dot de presença online */}
          <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full
                           bg-primary border-2 border-bg2"/>
        </div>
      </div>
    </header>
  )
}

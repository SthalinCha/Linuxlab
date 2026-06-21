export default function LoginBackground() {
  return (
    <div className="pointer-events-none">
      <svg className="h-[42rem] w-[42rem]" viewBox="0 0 900 900" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#e0f2fe" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#dcfce7" stopOpacity="0.72" />
          </linearGradient>
          <linearGradient id="darkGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#334155" stopOpacity="0.96" />
          </linearGradient>
        </defs>

        <circle cx="200" cy="220" r="170" fill="url(#bgGrad)" opacity="0.75" />
        <circle cx="700" cy="720" r="150" fill="#d1fae5" opacity="0.6" />
        <circle cx="130" cy="720" r="110" fill="#dbeafe" opacity="0.7" />

        <g opacity="0.6">
          <circle cx="810" cy="110" r="50" fill="#d1fae5" />
          <circle cx="840" cy="810" r="60" fill="#fde68a" />
        </g>

        <g>
          <rect x="90" y="150" width="260" height="190" rx="18" fill="url(#darkGrad)" />
          <circle cx="118" cy="178" r="6" fill="#ef4444" />
          <circle cx="140" cy="178" r="6" fill="#f59e0b" />
          <circle cx="162" cy="178" r="6" fill="#10b981" />
          <rect x="110" y="210" width="120" height="8" rx="4" fill="#38bdf8" opacity="0.9" />
          <rect x="110" y="235" width="160" height="8" rx="4" fill="#34d399" opacity="0.9" />
          <rect x="110" y="260" width="90" height="8" rx="4" fill="#e2e8f0" opacity="0.7" />
          <rect x="110" y="285" width="140" height="8" rx="4" fill="#34d399" opacity="0.9" />
          <rect x="110" y="310" width="40" height="8" rx="4" fill="#38bdf8" opacity="0.9" />
        </g>

        <g>
          <rect x="420" y="180" width="180" height="420" rx="18" fill="url(#darkGrad)" />

          <rect x="438" y="200" width="144" height="70" rx="8" fill="#334155" />
          <rect x="452" y="220" width="70" height="7" rx="3" fill="#38bdf8" />
          <rect x="452" y="240" width="45" height="7" rx="3" fill="#10b981" />
          <circle cx="555" cy="233" r="5" fill="#ef4444" />
          <circle cx="542" cy="233" r="5" fill="#10b981" />

          <rect x="438" y="285" width="144" height="70" rx="8" fill="#334155" />
          <rect x="452" y="305" width="85" height="7" rx="3" fill="#38bdf8" />
          <rect x="452" y="325" width="55" height="7" rx="3" fill="#f59e0b" />
          <circle cx="555" cy="318" r="5" fill="#10b981" />
          <circle cx="542" cy="318" r="5" fill="#10b981" />

          <rect x="438" y="370" width="144" height="70" rx="8" fill="#334155" />
          <rect x="452" y="390" width="60" height="7" rx="3" fill="#38bdf8" />
          <rect x="452" y="410" width="40" height="7" rx="3" fill="#34d399" />
          <circle cx="555" cy="403" r="5" fill="#ef4444" />
          <circle cx="542" cy="403" r="5" fill="#f59e0b" />

          <rect x="448" y="465" width="124" height="4" rx="2" fill="#475569" />
          <rect x="448" y="480" width="124" height="4" rx="2" fill="#475569" />
          <rect x="448" y="495" width="124" height="4" rx="2" fill="#475569" />
          <rect x="448" y="510" width="124" height="4" rx="2" fill="#475569" />
          <rect x="448" y="525" width="124" height="4" rx="2" fill="#475569" />

          <circle cx="510" cy="570" r="4" fill="#34d399" />
        </g>

        <g>
          <rect x="660" y="240" width="150" height="95" rx="16" fill="#fff" stroke="#dbeafe" strokeWidth="2" />
          <rect x="680" y="262" width="80" height="7" rx="3" fill="#3b82f6" opacity="0.85" />
          <rect x="680" y="280" width="55" height="7" rx="3" fill="#10b981" opacity="0.85" />
          <rect x="680" y="298" width="40" height="5" rx="2" fill="#e2e8f0" />
          <rect x="680" y="315" width="70" height="5" rx="2" fill="#94a3b8" />
        </g>

        <g>
          <rect x="660" y="360" width="150" height="95" rx="16" fill="#fff" stroke="#dbeafe" strokeWidth="2" />
          <rect x="680" y="382" width="80" height="7" rx="3" fill="#3b82f6" opacity="0.85" />
          <rect x="680" y="400" width="55" height="7" rx="3" fill="#f59e0b" opacity="0.85" />
          <rect x="680" y="418" width="40" height="5" rx="2" fill="#e2e8f0" />
          <rect x="680" y="435" width="70" height="5" rx="2" fill="#94a3b8" />
        </g>

        <g>
          <rect x="660" y="480" width="150" height="95" rx="16" fill="#fff" stroke="#dbeafe" strokeWidth="2" />
          <rect x="680" y="502" width="80" height="7" rx="3" fill="#3b82f6" opacity="0.85" />
          <rect x="680" y="520" width="55" height="7" rx="3" fill="#a78bfa" opacity="0.85" />
          <rect x="680" y="538" width="40" height="5" rx="2" fill="#e2e8f0" />
          <rect x="680" y="555" width="70" height="5" rx="2" fill="#94a3b8" />
        </g>

        <g>
          <path d="M600 273 Q 625 273, 660 280" stroke="#93c5fd" strokeWidth="2.5" strokeDasharray="5 6" strokeLinecap="round" />
          <path d="M600 410 Q 625 410, 660 410" stroke="#93c5fd" strokeWidth="2.5" strokeDasharray="5 6" strokeLinecap="round" />
          <path d="M600 530 Q 625 530, 660 527" stroke="#93c5fd" strokeWidth="2.5" strokeDasharray="5 6" strokeLinecap="round" />
        </g>

        <g>
          <circle cx="384" cy="372" r="16" fill="#3b82f6" />
          <circle cx="538" cy="460" r="16" fill="#10b981" />
          <circle cx="640" cy="490" r="16" fill="#f59e0b" />
          <circle cx="688" cy="534" r="16" fill="#0f172a" />
        </g>
      </svg>
    </div>
  )
}

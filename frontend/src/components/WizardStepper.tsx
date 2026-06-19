interface Step {
  number: number
  label: string
}

interface Props {
  steps: Step[]
  current: number
}

export default function WizardStepper({ steps, current }: Props) {
  return (
    <div className="flex items-center justify-center gap-0 py-4" role="navigation" aria-label="Progreso del asistente">
      {steps.map((step, i) => {
        const isActive = step.number === current
        const isCompleted = step.number < current

        return (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                aria-current={isActive ? 'step' : undefined}
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2
                  transition-all duration-200
                  ${isActive
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200'
                    : isCompleted
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'bg-white border-slate-300 text-slate-400'
                  }
                `}
              >
                {isCompleted ? <i className="fas fa-check text-[10px]" /> : step.number}
              </div>
              <span
                className={`
                  text-[11px] font-medium mt-1.5 whitespace-nowrap
                  ${isActive ? 'text-indigo-700' : isCompleted ? 'text-emerald-600' : 'text-slate-400'}
                `}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`
                  w-12 sm:w-20 h-0.5 mx-2 sm:mx-3 rounded-full
                  ${isCompleted ? 'bg-emerald-400' : 'bg-slate-200'}
                `}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

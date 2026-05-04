"use client";

const steps = [
  { number: 1, label: "Date" },
  { number: 2, label: "Time" },
  { number: 3, label: "Details" },
  { number: 4, label: "Payment" },
];

export default function ProgressBar({ currentStep }) {
  return (
    <div className="w-full max-w-md mx-auto mb-8">
      <div className="flex items-center justify-between relative">
        {/* Background track */}
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-[var(--glass-border)]" />
        {/* Active track */}
        <div
          className="absolute top-4 left-0 h-0.5 bg-gradient-to-r from-[var(--gold)] to-[var(--gold-light)] transition-all duration-500 ease-out"
          style={{
            width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
          }}
        />

        {steps.map((step) => {
          const isCompleted = currentStep > step.number;
          const isActive = currentStep === step.number;

          return (
            <div key={step.number} className="relative flex flex-col items-center z-10">
              {/* Circle */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-400 ${
                  isCompleted
                    ? "bg-[var(--gold)] text-[#0a0a0a] shadow-[0_0_15px_rgba(201,168,76,0.3)]"
                    : isActive
                    ? "bg-[var(--gold)]/20 border-2 border-[var(--gold)] text-[var(--gold)] shadow-[0_0_20px_rgba(201,168,76,0.15)]"
                    : "bg-[var(--card-bg)] border border-[var(--glass-border)] text-[var(--text-muted)]"
                }`}
              >
                {isCompleted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              {/* Label */}
              <span
                className={`mt-2 text-xs font-medium transition-colors duration-300 ${
                  isActive || isCompleted
                    ? "text-[var(--gold)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

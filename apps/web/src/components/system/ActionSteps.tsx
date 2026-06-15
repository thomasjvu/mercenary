type ActionStep = {
  label: string;
  value: string;
  onClick?: () => void;
};

type ActionStepsProps = {
  steps: readonly ActionStep[];
};

export function ActionSteps({ steps }: ActionStepsProps) {
  return (
    <div className="action-steps">
      {steps.map((step) => (
        <div className="action-steps__row" key={step.label}>
          <span className="action-steps__label">{step.label}</span>
          {step.onClick ? (
            <button className="action-steps__value" onClick={step.onClick} type="button">
              {step.value}
            </button>
          ) : (
            <strong className="action-steps__value">{step.value}</strong>
          )}
        </div>
      ))}
    </div>
  );
}

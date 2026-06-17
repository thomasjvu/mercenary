type FilterPriceSliderProps = {
  label: string;
  min: number;
  max: number;
  value: number;
  displayValue: string;
  onChange: (value: number) => void;
  className?: string;
};

function resolvePriceStep(min: number, max: number): number {
  const span = Math.max(max - min, 0);
  if (span <= 1) {
    return 0.01;
  }
  if (span <= 10) {
    return 0.05;
  }
  return 0.1;
}

export function FilterPriceSlider({
  label,
  min,
  max,
  value,
  displayValue,
  onChange,
  className = 'market-filters__price-slider',
}: FilterPriceSliderProps) {
  const step = resolvePriceStep(min, max);
  const sliderMax = Math.max(max, min + step);

  return (
    <div className={className}>
      <div className="market-filters__price-slider-head">
        <span className="market-filters__price-slider-label">{label}</span>
        <span className="market-filters__price-slider-value">{displayValue}</span>
      </div>
      <input
        aria-label={label}
        aria-valuemax={sliderMax}
        aria-valuemin={min}
        aria-valuenow={value}
        className="market-filters__price-slider-input"
        max={sliderMax}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </div>
  );
}

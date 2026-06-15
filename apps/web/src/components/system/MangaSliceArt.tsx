const SLICE_POSITIONS = [0, 33.333, 66.666, 100] as const;

type MangaSliceArtProps = {
  src: string;
  className?: string;
};

export function MangaSliceArt({ src, className = '' }: MangaSliceArtProps) {
  return (
    <div aria-hidden="true" className={`manga-slice-art${className ? ` ${className}` : ''}`}>
      <div className="manga-slice-art__set">
        {SLICE_POSITIONS.map((position, index) => (
          <span
            className="manga-slice-art__slice"
            key={index}
            style={{
              backgroundImage: `url("${src}")`,
              backgroundPosition: `${position}% 50%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

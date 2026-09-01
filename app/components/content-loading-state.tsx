export function AnimatedLoadingText({ children }: { children: string }) {
  return <span className="content-loading-label" aria-label={children}>
    {Array.from(children).map((character, index) => <span
      aria-hidden="true"
      style={{ animationDelay: `${index * 70}ms` }}
      key={`${character}-${index}`}
    >{character}</span>)}
  </span>;
}

export function ContentLoadingState({ children }: { children: string }) {
  return <div className="content-loading-state" role="status">
    <AnimatedLoadingText>{children}</AnimatedLoadingText>
  </div>;
}

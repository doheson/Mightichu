/** 남은 손패를 겹친 카드 모양으로. 숫자만으로는 한눈에 안 들어온다. */

const MAX_SHOWN = 8;

export function CardStack({ count }: { readonly count: number }): React.JSX.Element {
  const shown = Math.min(count, MAX_SHOWN);
  return (
    <span className="stack" title={`${count}장`} aria-label={`${count}장`}>
      <span className="stack__cards">
        {Array.from({ length: shown }, (_, i) => (
          <span key={i} className="stack__card" style={{ left: `${i * 4}px` }} />
        ))}
      </span>
      <span className="stack__count">{count}</span>
    </span>
  );
}

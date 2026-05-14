import { For, type Component } from "solid-js";

type Segment = { text: string; match: boolean };

const buildSegments = (text: string, positions: number[]): Segment[] => {
  if (text.length === 0) return [];
  if (positions.length === 0) return [{ text, match: false }];
  const set = new Set(positions);
  const out: Segment[] = [];
  let start = 0;
  let curMatch = set.has(0);
  for (let i = 1; i < text.length; i++) {
    const m = set.has(i);
    if (m !== curMatch) {
      out.push({ text: text.slice(start, i), match: curMatch });
      start = i;
      curMatch = m;
    }
  }
  out.push({ text: text.slice(start), match: curMatch });
  return out;
};

export const Highlight: Component<{ text: string; positions: number[] }> = (props) => {
  const segments = () => buildSegments(props.text, props.positions);
  return (
    <For each={segments()}>
      {(seg) =>
        seg.match ? <mark class="bgd-mark">{seg.text}</mark> : <>{seg.text}</>
      }
    </For>
  );
};

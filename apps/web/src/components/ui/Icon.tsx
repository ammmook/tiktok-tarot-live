export default function Icon({name, size = 18}: {name: string; size?: number}) {
 const paths: Record<string, React.ReactNode> = {
 plus: <path d="M12 5v14M5 12h14"/>, play: <path d="m9 5 11 7-11 7Z"/>, check: <path d="m5 12 4 4L19 6"/>,
 search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
 clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
 bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
 edit: <path d="m16 3 5 5-12 12H4v-5ZM13 6l5 5"/>,
 trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>,
 skip: <path d="m4 5 11 7-11 7ZM19 5v14"/>,
 gift: <><path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13"/><path d="M12 8C3 8 5 1 9 3l3 5c9 0 7-7 3-5Z"/></>,
 message: <path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z"/>,
 moon: <path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/>,
 arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
 more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
 star: <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.star}</svg>;
}


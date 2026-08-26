const paths = {
  camera: '<path d="M14.5 6 13 4H7L5.5 6H3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4.5Z"/><circle cx="10" cy="12.5" r="3.5"/>',
  gallery: '<rect x="2" y="3" width="18" height="16" rx="3"/><circle cx="7" cy="8" r="1.5"/><path d="m4.5 17 4.7-4.8a2 2 0 0 1 2.8 0l1.4 1.4 1.1-1.1a2 2 0 0 1 2.8 0L19.5 15"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h5M8 12h8M8 16h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  sparkle: '<path d="m12 2 1.2 4.1L17 8l-3.8 1.9L12 14l-1.2-4.1L7 8l3.8-1.9L12 2Z"/><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/>',
  upload: '<path d="M12 16V3M7 8l5-5 5 5"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  flash: '<path d="m13 2-8 11h6l-1 9 9-13h-6z"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  trash: '<path d="M4 7h16M9 3h6l1 4H8l1-4Z"/><path d="m6 7 1 14h10l1-14M10 11v6M14 11v6"/>',
  crown: '<path d="m3 7 4 4 5-7 5 7 4-4-2 12H5z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
};

export default function Icon({ name, size = 22, strokeWidth = 1.9, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: paths[name] || paths.sparkle }}
    />
  );
}

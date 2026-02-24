export type NavItem =
  | { label: 'Markets'; href: '/'; kind: 'link' }
  | { label: 'About'; href: '#about'; kind: 'anchor' }
  | { label: 'High Volume'; href: '/?view=high-volume'; kind: 'link' };

export const navItems: NavItem[] = [
  { label: 'Markets', href: '/', kind: 'link' },
  { label: 'About', href: '#about', kind: 'anchor' },
  { label: 'High Volume', href: '/?view=high-volume', kind: 'link' },
];

import Link from 'next/link';
import Image from 'next/image';

const navItems = [
  { label: 'Markets', href: '#markets' },
  { label: 'History', href: '#history' },
  { label: 'About', href: '#about' },
];

export function Navbar() {
  return (
    <header className="bg-[#002cff] text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/polybet.png" alt="Polybet logo" width={32} height={32} />
          <span className="text-xl font-semibold">Polybet</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="hover:text-slate-100">
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

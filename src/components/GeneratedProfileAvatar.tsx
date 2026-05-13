type GeneratedProfileAvatarProps = {
  name: string;
  size?: number;
  rounded?: 'square' | 'circle';
  className?: string;
};

const skinTones = ['#f2c7a5', '#d99b73', '#b87552', '#8f5f43', '#f0b98f'];
const shirtColors = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#dc2626'];
const hairColors = ['#1f2937', '#3f2f25', '#111827', '#6b3f24', '#4b5563'];

const hashName = (name: string) => {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const pick = <T,>(items: T[], hash: number, shift: number) =>
  items[(hash >> shift) % items.length];

export function GeneratedProfileAvatar({
  name,
  size = 64,
  rounded = 'square',
  className = '',
}: GeneratedProfileAvatarProps) {
  const hash = hashName(name);
  const hue = hash % 360;
  const bgA = `hsl(${hue} 86% 56%)`;
  const bgB = `hsl(${(hue + 72) % 360} 82% 46%)`;
  const bgC = `hsl(${(hue + 164) % 360} 92% 62%)`;
  const skin = pick(skinTones, hash, 3);
  const shirt = pick(shirtColors, hash, 7);
  const hair = pick(hairColors, hash, 11);
  const hairVariant = (hash >> 15) % 3;
  const mouthVariant = (hash >> 18) % 3;
  const accessoryVariant = (hash >> 21) % 4;
  const eyeOffset = ((hash >> 24) % 3) - 1;
  const radiusClass = rounded === 'circle' ? 'rounded-full' : 'rounded-2xl';

  return (
    <div
      role="img"
      aria-label={`${name} profile avatar`}
      className={`relative shrink-0 overflow-hidden border border-white/20 bg-slate-900 shadow-sm ${radiusClass} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 96 96" className="h-full w-full" aria-hidden="true">
        <rect width="96" height="96" fill={bgA} />
        <path d="M0 78 C18 55, 33 66, 49 42 C63 21, 79 28, 96 8 L96 96 L0 96 Z" fill={bgB} opacity="0.72" />
        <circle cx="18" cy="18" r="24" fill="#fff" opacity="0.18" />
        <circle cx="78" cy="70" r="20" fill={bgC} opacity="0.34" />

        <path d="M20 88 C25 70, 36 61, 48 61 C60 61, 71 70, 76 88 Z" fill={shirt} />
        <path d="M34 66 C37 72, 42 75, 48 75 C54 75, 59 72, 62 66" fill="none" stroke="rgba(255,255,255,0.52)" strokeWidth="3" strokeLinecap="round" />

        <circle cx="48" cy="43" r="24" fill={skin} />
        {hairVariant === 0 && (
          <path d="M25 38 C26 20, 40 12, 55 17 C68 21, 74 31, 71 43 C62 34, 47 32, 35 35 C31 36, 28 37, 25 38 Z" fill={hair} />
        )}
        {hairVariant === 1 && (
          <path d="M24 43 C22 27, 32 15, 48 14 C64 13, 75 25, 72 43 C65 31, 55 28, 44 31 C35 33, 29 38, 24 43 Z" fill={hair} />
        )}
        {hairVariant === 2 && (
          <path d="M26 42 C25 24, 37 14, 52 16 C64 18, 72 29, 70 43 C62 38, 55 29, 43 30 C35 30, 30 35, 26 42 Z" fill={hair} />
        )}

        {accessoryVariant === 0 && (
          <>
            <circle cx={39 + eyeOffset} cy="44" r="6" fill="none" stroke="#1f2937" strokeWidth="2" />
            <circle cx={57 + eyeOffset} cy="44" r="6" fill="none" stroke="#1f2937" strokeWidth="2" />
            <path d="M45 44 H51" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        <circle cx={39 + eyeOffset} cy="45" r="2.4" fill="#111827" />
        <circle cx={57 + eyeOffset} cy="45" r="2.4" fill="#111827" />
        <path d="M37 38 C40 36, 43 36, 45 38" fill="none" stroke={hair} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M52 38 C55 36, 58 36, 60 38" fill="none" stroke={hair} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M49 47 C47 51, 47 53, 50 54" fill="none" stroke="#8a5a44" strokeWidth="2" strokeLinecap="round" />
        {mouthVariant === 0 && <path d="M40 59 C45 64, 52 64, 57 59" fill="none" stroke="#7f1d1d" strokeWidth="2.5" strokeLinecap="round" />}
        {mouthVariant === 1 && <path d="M42 60 H55" fill="none" stroke="#7f1d1d" strokeWidth="2.5" strokeLinecap="round" />}
        {mouthVariant === 2 && <path d="M42 58 C46 61, 51 61, 55 58" fill="none" stroke="#7f1d1d" strokeWidth="2.5" strokeLinecap="round" />}

        <circle cx="30" cy="52" r="4" fill="#ef8d8d" opacity="0.28" />
        <circle cx="66" cy="52" r="4" fill="#ef8d8d" opacity="0.28" />
      </svg>
    </div>
  );
}

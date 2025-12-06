type Props = {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
};

export function CategorySelect({ categories, value, onChange }: Props) {
  const options = ['All', ...categories];
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="text-sm font-semibold text-slate-700">Category</span>
      <select
        className="rounded-full border border-slate-200 px-3 py-1 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

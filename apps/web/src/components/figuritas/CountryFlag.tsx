export function CountryFlag({
  country,
  size = 'md',
}: {
  country: { flag?: string | null; flagUrl?: string | null; name: string };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizes = {
    xs: 'text-sm',
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-3xl',
    xl: 'text-5xl',
  };
  const imgSizes = {
    xs: 'h-4 w-4',
    sm: 'h-5 w-5',
    md: 'h-7 w-7',
    lg: 'h-10 w-10',
    xl: 'h-14 w-14',
  };

  if (country.flagUrl?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={country.flagUrl}
        alt={country.name}
        className={`${imgSizes[size]} rounded-md object-cover shadow-sm ring-1 ring-black/10`}
      />
    );
  }

  return (
    <span className={sizes[size]} role="img" aria-label={country.name}>
      {country.flag ?? '🏳️'}
    </span>
  );
}

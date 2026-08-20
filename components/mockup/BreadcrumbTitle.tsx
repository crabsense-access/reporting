interface BreadcrumbTitleProps {
  parent: string;
  current: string;
}

export function BreadcrumbTitle({ parent, current }: BreadcrumbTitleProps) {
  return (
    <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
      <span className="text-neutral-900">{parent}</span>{" "}
      <span className="text-neutral-300">{current}</span>
    </h1>
  );
}

import { NewClientWizard } from "@/components/admin/NewClientWizard";

export default function NewClientPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Nuevo cliente</h1>
        <p className="text-sm text-muted-foreground">
          Dá de alta un cliente y sus conexiones a GA4, Search Console y Google Ads.
        </p>
      </div>
      <NewClientWizard />
    </div>
  );
}

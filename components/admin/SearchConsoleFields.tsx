"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SearchConsoleFormErrors, SearchConsoleFormValues } from "@/lib/gsc/config";

interface SearchConsoleFieldsProps {
  value: SearchConsoleFormValues;
  onChange: (value: SearchConsoleFormValues) => void;
  errors?: SearchConsoleFormErrors;
}

export function SearchConsoleFields({ value, onChange, errors }: SearchConsoleFieldsProps) {
  function patch(partial: Partial<SearchConsoleFormValues>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="sc-enabled">¿Este cliente tiene Search Console conectado?</Label>
          <p className="text-sm text-muted-foreground">
            Activalo para configurar su propiedad de Search Console.
          </p>
        </div>
        <Switch
          id="sc-enabled"
          checked={value.enabled}
          onCheckedChange={(checked) => patch({ enabled: checked })}
        />
      </div>

      {value.enabled && (
        <div className="flex flex-col gap-6 rounded-lg border border-border p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sc-site-url">Site URL del sitio</Label>
            <Input
              id="sc-site-url"
              value={value.siteUrl}
              onChange={(event) => patch({ siteUrl: event.target.value })}
              placeholder="sc-domain:ejemplo.com"
            />
            {errors?.siteUrl && <p className="text-xs text-destructive">{errors.siteUrl}</p>}
            <p className="text-xs text-muted-foreground">
              Ej: sc-domain:ejemplo.com para propiedades de dominio, o https://www.ejemplo.com/
              para propiedades de prefijo — tiene que coincidir exactamente con cómo está
              verificada la propiedad.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sc-home-page-regex">Regex de la home / página principal (opcional)</Label>
            <Input
              id="sc-home-page-regex"
              value={value.homePageRegex}
              onChange={(event) => patch({ homePageRegex: event.target.value })}
              placeholder="Ej: ^https://www\.ejemplo\.com/?$"
            />
            {errors?.homePageRegex && <p className="text-xs text-destructive">{errors.homePageRegex}</p>}
            <p className="text-xs text-muted-foreground">
              Define el segmento &ldquo;Home&rdquo; del selector de páginas — matchea SOLO la
              página principal, no todo el sitio (para eso ya está &ldquo;Todo el sitio&rdquo;).
              Sin configurar, se usa como fallback la URL raíz de la Site URL de arriba.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sc-brand-regex">Regex de brand keywords (opcional)</Label>
            <Input
              id="sc-brand-regex"
              value={value.brandRegex}
              onChange={(event) => patch({ brandRegex: event.target.value })}
              placeholder="Ej: rhino ?shield"
            />
            {errors?.brandRegex && <p className="text-xs text-destructive">{errors.brandRegex}</p>}
            <p className="text-xs text-muted-foreground">
              Términos de búsqueda que matcheen este patrón se clasifican como &ldquo;brand&rdquo; en
              Keywords &gt; Resumen. Sin configurar, esas tablas no se muestran.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="sc-has-blog">¿Tiene sección de Blog?</Label>
            <Switch
              id="sc-has-blog"
              checked={value.hasBlog}
              onCheckedChange={(checked) => patch({ hasBlog: checked })}
            />
          </div>

          {value.hasBlog && (
            <div className="flex flex-col gap-6 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="sc-same-property" className="max-w-sm">
                  ¿El blog vive en la misma propiedad de Search Console que el sitio
                  institucional?
                </Label>
                <Switch
                  id="sc-same-property"
                  checked={value.sameProperty}
                  onCheckedChange={(checked) => patch({ sameProperty: checked })}
                />
              </div>

              {!value.sameProperty && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sc-blog-site-url">Site URL del blog</Label>
                  <Input
                    id="sc-blog-site-url"
                    value={value.blogSiteUrl}
                    onChange={(event) => patch({ blogSiteUrl: event.target.value })}
                    placeholder="sc-domain:blog.ejemplo.com"
                  />
                  {errors?.blogSiteUrl && (
                    <p className="text-xs text-destructive">{errors.blogSiteUrl}</p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="sc-home-regex">Regex de la portada del blog</Label>
                <Input
                  id="sc-home-regex"
                  value={value.homeRegex}
                  onChange={(event) => patch({ homeRegex: event.target.value })}
                  placeholder="Ej: ^/blog/?$"
                />
                {errors?.homeRegex && <p className="text-xs text-destructive">{errors.homeRegex}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="sc-posts-regex">Regex de las notas/artículos</Label>
                <Input
                  id="sc-posts-regex"
                  value={value.postsRegex}
                  onChange={(event) => patch({ postsRegex: event.target.value })}
                  placeholder="Ej: ^/blog/[^/]+/?$"
                />
                {errors?.postsRegex && (
                  <p className="text-xs text-destructive">{errors.postsRegex}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { addClientUserAction, removeClientUserAction } from "@/app/admin/(dashboard)/clients/actions";
import type { ClientUser } from "@/lib/types";

interface ClientUsersManagerProps {
  clientId: string;
  /** Slug del cliente: arma la URL del reporte a la que caen estos usuarios al loguearse. */
  clientSlug: string;
  users: ClientUser[];
}

export function ClientUsersManager({ clientId, clientSlug, users: initialUsers }: ClientUsersManagerProps) {
  const [users, setUsers] = useState(initialUsers);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const reportUrl =
    typeof window !== "undefined" ? `${window.location.origin}/${clientSlug}/reporting` : `/${clientSlug}/reporting`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reportUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: la URL igual queda visible para copiar a mano.
    }
  }

  function handleAdd() {
    const email = newEmail.trim();
    if (!email) return;
    setError(null);
    startTransition(async () => {
      const result = await addClientUserAction(clientId, email);
      if (result.error) {
        setError(result.error);
        return;
      }
      setUsers((prev) => [
        ...prev,
        { id: crypto.randomUUID(), client_id: clientId, email, created_at: new Date().toISOString() },
      ]);
      setNewEmail("");
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeClientUserAction(id, clientId);
      if (!result.error) {
        setUsers((prev) => prev.filter((user) => user.id !== id));
      }
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Ver y agregar usuarios</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Usuarios autorizados</DialogTitle>
          <DialogDescription>
            Emails de Google con acceso al tablero de este cliente. Al iniciar sesión van
            directo a la URL del reporte.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
          <a
            href={reportUrl}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate text-sm text-foreground underline-offset-4 hover:underline"
          >
            {reportUrl}
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            aria-label="Copiar URL del reporte"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {users.length === 0 && (
            <li className="text-sm text-muted-foreground">Sin usuarios autorizados.</li>
          )}
          {users.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-secondary/50"
            >
              <span>{user.email}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(user.id)}
                disabled={isPending}
                aria-label={`Quitar a ${user.email}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Input
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            placeholder="nombre@cliente.com"
          />
          <Button type="button" onClick={handleAdd} disabled={isPending}>
            Agregar
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}

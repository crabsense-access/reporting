"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DynamicListFieldProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  type?: string;
  addLabel?: string;
}

export function DynamicListField({
  values,
  onChange,
  placeholder,
  type = "text",
  addLabel = "Agregar",
}: DynamicListFieldProps) {
  function updateAt(index: number, value: string) {
    const next = [...values];
    next[index] = value;
    onChange(next);
  }

  function removeAt(index: number) {
    const next = values.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [""]);
  }

  function add() {
    onChange([...values, ""]);
  }

  return (
    <div className="flex flex-col gap-2">
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            type={type}
            value={value}
            placeholder={placeholder}
            onChange={(event) => updateAt(index, event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeAt(index)}
            disabled={values.length === 1 && value === ""}
            aria-label="Quitar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={add}>
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}

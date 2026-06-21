import { Input } from "@/components/ui/input";

interface ExpenseCategoryInputProps {
  id: string;
  listId: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly string[];
  placeholder?: string;
  disabled?: boolean;
}

export function ExpenseCategoryInput({
  id,
  listId,
  value,
  onChange,
  suggestions,
  placeholder,
  disabled,
}: ExpenseCategoryInputProps) {
  return (
    <>
      <Input
        id={id}
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <datalist id={listId}>
        {suggestions.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </>
  );
}

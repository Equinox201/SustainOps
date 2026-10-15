import { departmentOptions } from "../constants";
import type { SustainabilityCaseInput } from "@/lib/types";
import { Field } from "./Field";
import { fieldClassName, inputClassName } from "./form-styles";

export function CaseForm({
  value,
  onChange,
  disabled = false,
}: {
  value: SustainabilityCaseInput;
  onChange: (value: SustainabilityCaseInput) => void;
  disabled?: boolean;
}) {
  function updateField(
    field: keyof SustainabilityCaseInput,
    nextValue: string,
  ) {
    onChange({
      ...value,
      [field]: nextValue,
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Property">
        <input
          className={inputClassName}
          type="text"
          value={value.property}
          disabled={disabled}
          onChange={(event) => updateField("property", event.target.value)}
        />
      </Field>

      <Field label="Department">
        <select
          className={inputClassName}
          value={value.department}
          disabled={disabled}
          onChange={(event) => updateField("department", event.target.value)}
        >
          {departmentOptions.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Sustainability Issue" className="md:col-span-2">
        <input
          className={inputClassName}
          type="text"
          value={value.issue}
          disabled={disabled}
          onChange={(event) => updateField("issue", event.target.value)}
        />
      </Field>

      <Field label="Current Metric">
        <input
          className={inputClassName}
          type="text"
          value={value.currentMetric}
          disabled={disabled}
          onChange={(event) => updateField("currentMetric", event.target.value)}
        />
      </Field>

      <Field label="Target Metric">
        <input
          className={inputClassName}
          type="text"
          value={value.targetMetric}
          disabled={disabled}
          onChange={(event) => updateField("targetMetric", event.target.value)}
        />
      </Field>

      <Field label="Operational Context" className="md:col-span-2">
        <textarea
          className={`${fieldClassName} min-h-32 resize-y`}
          value={value.operationalContext}
          disabled={disabled}
          onChange={(event) =>
            updateField("operationalContext", event.target.value)
          }
        />
      </Field>
    </div>
  );
}

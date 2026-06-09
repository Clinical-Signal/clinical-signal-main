import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AiConfirmationSlot,
  IntakeDataSchema,
  ProvenanceSource,
} from "./intake-data.schema";
import { StepOneSchema } from "./step-one.schema";

function describeZodShape(schema: z.ZodTypeAny): unknown {
  if (schema instanceof z.ZodObject) {
    return Object.fromEntries(
      Object.entries(schema.shape).map(([key, fieldSchema]) => [
        key,
        describeZodShape(fieldSchema as z.ZodTypeAny),
      ]),
    );
  }

  if (schema instanceof z.ZodOptional) {
    return { optional: describeZodShape(schema.unwrap()) };
  }

  if (schema instanceof z.ZodDefault) {
    return { default: describeZodShape(schema.removeDefault()) };
  }

  if (schema instanceof z.ZodArray) {
    return { array: describeZodShape(schema.element) };
  }

  if (schema instanceof z.ZodRecord) {
    const valueSchema = schema.valueSchema;
    return {
      record: valueSchema ? describeZodShape(valueSchema) : "unknown",
    };
  }

  if (schema instanceof z.ZodUnknown) {
    return "ZodUnknown";
  }

  if (schema instanceof z.ZodBoolean) {
    return "ZodBoolean";
  }

  if (schema instanceof z.ZodEnum) {
    return { enum: schema.options };
  }

  return schema?.constructor?.name ?? "unknown";
}

describe("intake-data.schema", () => {
  it("matches IntakeDataSchema.shape snapshot", () => {
    expect(describeZodShape(IntakeDataSchema)).toMatchSnapshot();
  });

  it("matches ProvenanceSource.shape snapshot", () => {
    expect(describeZodShape(ProvenanceSource)).toMatchSnapshot();
  });

  it("matches AiConfirmationSlot.shape snapshot", () => {
    expect(describeZodShape(AiConfirmationSlot)).toMatchSnapshot();
  });

  it("extends StepOneSchema with metadata fields", () => {
    const intakeShape = describeZodShape(IntakeDataSchema) as Record<
      string,
      unknown
    >;
    const stepOneShape = describeZodShape(StepOneSchema) as Record<
      string,
      unknown
    >;

    for (const key of Object.keys(stepOneShape)) {
      expect(intakeShape[key]).toEqual(stepOneShape[key]);
    }

    expect(intakeShape).toHaveProperty("step_two");
    expect(intakeShape).toHaveProperty("_provenance");
    expect(intakeShape).toHaveProperty("_ai_confirmations");
    expect(intakeShape).toHaveProperty("_analysis_degraded");
  });
});

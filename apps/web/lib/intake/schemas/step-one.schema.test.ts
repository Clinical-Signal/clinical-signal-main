import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AboutYouSchema,
  LifestyleSchema,
  StepOneSchema,
  SymptomsSchema,
  WhyHereSchema,
} from "./step-one.schema";

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

  if (schema instanceof z.ZodEnum) {
    return { enum: schema.options };
  }

  if (schema instanceof z.ZodLiteral) {
    return { literal: schema.value };
  }

  return schema.constructor.name;
}

describe("step-one.schema", () => {
  it("matches AboutYouSchema.shape snapshot", () => {
    expect(describeZodShape(AboutYouSchema)).toMatchSnapshot();
  });

  it("matches WhyHereSchema.shape snapshot", () => {
    expect(describeZodShape(WhyHereSchema)).toMatchSnapshot();
  });

  it("matches SymptomsSchema.shape snapshot", () => {
    expect(describeZodShape(SymptomsSchema)).toMatchSnapshot();
  });

  it("matches LifestyleSchema.shape snapshot", () => {
    expect(describeZodShape(LifestyleSchema)).toMatchSnapshot();
  });

  it("matches StepOneSchema.shape snapshot", () => {
    expect(describeZodShape(StepOneSchema)).toMatchSnapshot();
  });
});

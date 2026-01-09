import { z } from "zod";
import { MetricsSchema } from "./schema.js";

type Metrics = z.infer<typeof MetricsSchema>;

const example: Metrics = { metrics: { a: 1, b: 2 } };
const value: number = example.metrics.a;
void value;

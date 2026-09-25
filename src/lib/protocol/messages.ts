import { z } from "zod";

// Mirrors backend/src/types/messages.ts, from the phone app's ("app" role)
// side of the protocol. Inbound messages are schema-validated since this is
// a real network boundary; outbound ones are plain types since we control
// what we send.

export const pcSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  lastSeen: z.string(),
  online: z.boolean(),
  lanDevices: z.array(
    z.object({ ip: z.string(), mac: z.string(), name: z.string().optional() })
  ),
});
export type PcSummary = z.infer<typeof pcSummarySchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth_ok"), deviceId: z.string(), role: z.enum(["pc", "app"]) }),
  z.object({ type: z.literal("devices"), pcs: z.array(pcSummarySchema) }),
  z.object({ type: z.literal("signal"), from: z.string(), payload: z.unknown() }),
  z.object({ type: z.literal("pong") }),
  z.object({ type: z.literal("error"), message: z.string(), target: z.string().optional() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export type AppMessage =
  | { type: "auth"; token: string; deviceId: string; role: "app"; name: string }
  | { type: "get_devices" }
  | { type: "signal"; target: string; payload: unknown }
  | { type: "ping" };

import { NextResponse } from "next/server";

import { AdminAuthError, verifyDroproomAdminRequest, type AdminAuthPayload } from "@/lib/server/admin-auth";
import {
  BaseNotificationError,
  fetchBaseNotificationAudience,
  resolveBaseAppUrl,
  sendBaseNotification
} from "@/lib/server/base-notifications";

export const runtime = "nodejs";

type BaseNotificationRequest = {
  action?: "audience" | "send" | "test";
  auth?: AdminAuthPayload;
  message?: unknown;
  targetPath?: unknown;
  title?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as BaseNotificationRequest | null;
  const action = body?.action;

  if (action !== "audience" && action !== "send" && action !== "test") {
    return NextResponse.json({ error: "Unsupported notification admin action." }, { status: 400 });
  }

  try {
    const adminWallet = await verifyDroproomAdminRequest(request, body?.auth, action);

    const appUrl = resolveBaseAppUrl(request);
    const audience = await fetchBaseNotificationAudience(appUrl);

    if (action === "audience") {
      return NextResponse.json({
        appUrl,
        notificationEnabledCount: audience.length,
        users: audience.map((user) => user.address)
      });
    }

    const walletAddresses = action === "test" ? [adminWallet] : audience.map((user) => user.address);
    const result = await sendBaseNotification({
      appUrl,
      message: typeof body?.message === "string" ? body.message : "",
      targetPath: typeof body?.targetPath === "string" ? body.targetPath : "/",
      title: typeof body?.title === "string" ? body.title : "",
      walletAddresses
    });

    return NextResponse.json({
      appUrl,
      notificationEnabledCount: audience.length,
      ...result
    });
  } catch (error) {
    if (error instanceof AdminAuthError || error instanceof BaseNotificationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Base notification admin route failed", error);
    return NextResponse.json({ error: "Base notification request failed." }, { status: 500 });
  }
}

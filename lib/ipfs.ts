export function toIpfsUri(cid: string, path = "") {
  const cleanCid = cid.trim().replace(/^ipfs:\/\//, "").replace(/^\/ipfs\//, "");
  const cleanPath = path ? `/${path.replace(/^\/+/, "")}` : "";
  return `ipfs://${cleanCid}${cleanPath}`;
}

export function ipfsUriToGatewayUrl(uri: string, gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL) {
  if (!uri.startsWith("ipfs://")) return uri;

  const cleanGateway = (gateway || "https://gateway.pinata.cloud").replace(/\/+$/, "");
  return `${cleanGateway}/ipfs/${uri.slice("ipfs://".length)}`;
}

export function normalizeGatewayUrl(value?: string) {
  return value?.trim().replace(/\/+$/, "") || "https://gateway.pinata.cloud";
}

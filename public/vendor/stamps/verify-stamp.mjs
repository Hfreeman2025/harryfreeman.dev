/** Dependency-free WebCrypto consumer. Authenticate untouched PAE bytes before parsing facts. */
export const PINNED_KEY_SHA256 = "e201c24958d158d09f607f1951d2440aa3f0ce76061e5a67c0e6bcd7bc4ba023";
const TYPE = "application/vnd.in-toto+json", PREDICATE = "https://receipts.dev/attestation/check-suite/v1", POLICY_EXCEPTIONS = ["xcode-toolchain"];
const tools = [
    "gpt-in-a-tab",
    "real-or-hallucinated",
    "agent-race",
    "receipts",
    "dreaming",
    "grid-weather",
    "gridtop",
    "listen-to-the-grid",
    "ask-the-record",
    "sourced",
];
const record = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const string = (v, max = 8192) => typeof v === "string" && v.length > 0 && v.length <= max && !v.includes("\0");
const hash = (v) => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const gitHash = (v) => typeof v === "string" && /^[a-f0-9]{40}$/u.test(v);
const integer = (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const instant = (v) => typeof v === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString() === v;
const known = (v, names) => Object.keys(v).every((k) => names.includes(k));
function stream(v) {
    return record(v) && known(v, ["sha256", "bytes"]) && hash(v.sha256) && integer(v.bytes);
}
function runProblem(v) {
    if (!record(v) ||
        !known(v, [
            "kind",
            "argv",
            "status",
            "exitCode",
            "signal",
            "startedAt",
            "endedAt",
            "stdout",
            "stderr",
            "resultLine",
            "reason",
            "timedOut",
        ]))
        return "Invalid check record";
    if (!string(v.kind, 80) ||
        !string(v.resultLine, 500) ||
        /[\r\n]/u.test(v.resultLine) ||
        v.resultLine.includes(String.fromCharCode(27)))
        return "Invalid check description";
    if (v.argv !== null &&
        (!Array.isArray(v.argv) ||
            v.argv.length < 1 ||
            v.argv.length > 256 ||
            !v.argv.every((x) => typeof x === "string" && x.length <= 8192 && !x.includes("\0"))))
        return "Invalid command argv";
    if (v.reason !== null && !string(v.reason, 4000))
        return "Invalid check reason";
    if (typeof v.timedOut !== "boolean")
        return "Invalid timeout flag";
    if (v.status === "not-run") {
        if (!string(v.reason, 4000) ||
            v.exitCode !== null ||
            v.signal !== null ||
            v.startedAt !== null ||
            v.endedAt !== null ||
            v.stdout !== null ||
            v.stderr !== null ||
            v.timedOut)
            return "Not-run check invents execution facts";
        return null;
    }
    if (v.status !== "passed" && v.status !== "failed")
        return "Unsupported check status";
    if (!Array.isArray(v.argv) ||
        !instant(v.startedAt) ||
        !instant(v.endedAt) ||
        v.endedAt < v.startedAt ||
        !stream(v.stdout) ||
        !stream(v.stderr))
        return "Missing execution facts";
    if (v.exitCode !== null && (!integer(v.exitCode) || v.exitCode > 255))
        return "Invalid exit code";
    if (v.signal !== null && !string(v.signal, 80))
        return "Invalid signal";
    if ((v.exitCode === null) === (v.signal === null))
        return "Exactly one exit or signal is required";
    if (v.status === "passed" && (v.exitCode !== 0 || v.signal !== null || v.timedOut))
        return "Passing check contradicts process result";
    if (v.status === "failed" && ((v.exitCode === 0 && !v.timedOut) || !string(v.reason, 4000)))
        return "Failing check contradicts process result";
    return null;
}
/** Also used by the producer so browser and signer apply the same fail-closed profile. */
export function stampProblem(v) {
    if (!record(v) || v._type !== "https://in-toto.io/Statement/v1" || v.predicateType !== PREDICATE)
        return "Unsupported in-toto statement or predicate";
    const p = v.predicate;
    if (!record(p) ||
        !known(p, [
            "version",
            "tool",
            "repository",
            "capturedAt",
            "attestedAt",
            "status",
            "capture",
            "setup",
            "checks",
        ]) ||
        p.version !== 1 ||
        typeof p.tool !== "string" ||
        !tools.includes(p.tool))
        return "Invalid stamp predicate";
    if (!record(p.repository) ||
        !known(p.repository, ["commit", "tree"]) ||
        !gitHash(p.repository.commit) ||
        !gitHash(p.repository.tree))
        return "Missing exact Git commit/tree";
    if (!instant(p.capturedAt) || !instant(p.attestedAt) || p.attestedAt < p.capturedAt)
        return "Invalid capture/signing times";
    if (!Array.isArray(v.subject) ||
        v.subject.length !== 1 ||
        !record(v.subject[0]) ||
        !(v.subject[0].name === `captures/${p.tool}.json` ||
            (typeof v.subject[0].name === "string" &&
                (v.subject[0].name.startsWith(`history/${p.tool}-`) ||
                    v.subject[0].name.startsWith(`captures/${p.tool}-`)) &&
                /^(?:history|captures)\/[a-z0-9-]+\.json$/u.test(v.subject[0].name))) ||
        !record(v.subject[0].digest) ||
        !hash(v.subject[0].digest.sha256))
        return "Invalid capture subject digest";
    const c = p.capture;
    if (!record(c) ||
        !known(c, [
            "method",
            "source",
            "network",
            "initialTrackedClean",
            "sourceChangesDuringChecks",
            "policyExceptions",
            "dependencies",
            "notes",
            "priorCaptures",
            "runtime",
        ]) ||
        c.method !== "fresh-local-clone-non-browser" ||
        !["loopback-only", "not-os-isolated"].includes(String(c.network)) ||
        c.initialTrackedClean !== true ||
        typeof c.sourceChangesDuringChecks !== "boolean")
        return "Invalid capture provenance";
    if (c.policyExceptions !== undefined &&
        (!Array.isArray(c.policyExceptions) ||
            c.policyExceptions.length !== 1 ||
            !POLICY_EXCEPTIONS.includes(c.policyExceptions[0])))
        return "Unsupported capture policy exception";
    if (c.notes !== undefined &&
        (!Array.isArray(c.notes) || c.notes.length > 8 || !c.notes.every((x) => string(x, 500))))
        return "Invalid capture notes";
    if (c.priorCaptures !== undefined &&
        (!Array.isArray(c.priorCaptures) ||
            c.priorCaptures.length > 10 ||
            !c.priorCaptures.every((x) => record(x) &&
                known(x, ["file", "sha256", "reason"]) &&
                typeof x.file === "string" &&
                /^(?:history|captures)\/[a-z0-9-]+\.json$/u.test(x.file) &&
                hash(x.sha256) &&
                string(x.reason, 600))))
        return "Invalid prior-capture references";
    const dependencies = c.dependencies;
    if (!record(dependencies) ||
        !known(dependencies, ["lockfile", "sha256", "registry", "policy", "cache"]) ||
        !hash(dependencies.sha256) ||
        dependencies.cache !== "project-local-discarded" ||
        !((dependencies.lockfile === "package-lock.json" &&
            dependencies.registry === "https://registry.npmjs.org" &&
            dependencies.policy === "npm-ci-ignore-scripts") ||
            (dependencies.lockfile === "Cargo.lock" &&
                dependencies.registry === "https://crates.io" &&
                dependencies.policy === "cargo-fetch-locked")))
        return "Invalid locked dependency provenance";
    const area = ["receipts", "dreaming", "ask-the-record"].includes(p.tool) ? "oss" : "lab";
    if (c.source !== `Personal/${area}/${p.tool}` ||
        !record(c.runtime) ||
        !known(c.runtime, ["node", "npm", "platform", "arch"]) ||
        !Object.values(c.runtime).every((x) => string(x, 200)) ||
        Object.keys(c.runtime).length !== 4)
        return "Invalid capture source/runtime";
    if (!Array.isArray(p.checks) ||
        p.checks.length !== 3 ||
        !Array.isArray(p.setup) ||
        p.setup.length > 8)
        return "Missing required checks";
    const kinds = new Set();
    for (const check of p.checks) {
        const problem = runProblem(check);
        if (problem)
            return problem;
        if (!record(check) ||
            typeof check.kind !== "string" ||
            !["typecheck", "lint", "unit-tests"].includes(check.kind) ||
            kinds.has(check.kind))
            return "Duplicate or unsupported check kind";
        kinds.add(check.kind);
    }
    for (const run of p.setup) {
        const problem = runProblem(run);
        if (problem)
            return problem;
    }
    const all = [...p.setup, ...p.checks];
    if (c.network === "not-os-isolated" &&
        p.checks.some((x) => record(x) && x.kind !== "unit-tests" && x.status !== "not-run"))
        return "Unisolated supplement cannot claim other full checks";
    for (const run of all)
        if (record(run) && typeof run.endedAt === "string" && run.endedAt > p.capturedAt)
            return "Capture predates a command result";
    const expected = all.some((x) => record(x) && x.status === "failed")
        ? "failed"
        : c.sourceChangesDuringChecks || all.some((x) => record(x) && x.status === "not-run")
            ? "incomplete"
            : "passed";
    if (p.status !== expected)
        return "Suite result contradicts captured checks";
    return null;
}
function decode(value) {
    if (typeof value !== "string" ||
        value.length > 1400000 ||
        !/^[A-Za-z0-9+/_-]*={0,2}$/u.test(value) ||
        (/[+/]/u.test(value) && /[-_]/u.test(value)))
        throw new Error("Invalid base64");
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const text = atob(normalized);
    if (btoa(text).replace(/=+$/u, "") !== normalized.replace(/=+$/u, "") ||
        (value.includes("=") && value.length % 4 !== 0))
        throw new Error("Noncanonical base64");
    return Uint8Array.from(text, (char) => char.charCodeAt(0));
}
function message(type, payload) {
    const utf8 = new TextEncoder(), kind = utf8.encode(type), prefix = utf8.encode(`DSSEv1 ${kind.length} `), length = utf8.encode(` ${payload.byteLength} `);
    const bytes = new Uint8Array(prefix.length + kind.length + length.length + payload.length);
    let offset = 0;
    for (const part of [prefix, kind, length, payload]) {
        bytes.set(part, offset);
        offset += part.length;
    }
    return bytes;
}
export function createStampVerifier(pin) {
    return async (envelope, publicKey) => {
        const invalid = (reason) => ({
            valid: false,
            reason,
            statement: null,
            payload: null,
            checksPassed: null,
            keyFingerprint: null,
        });
        try {
            if (!hash(pin))
                return invalid("No trusted signer fingerprint configured");
            if (!globalThis.crypto?.subtle)
                return invalid("WebCrypto is unavailable; signature not verified");
            if (!record(publicKey) ||
                publicKey.algorithm !== "Ed25519" ||
                publicKey.encoding !== "base64" ||
                publicKey.keyId !== pin)
                return invalid("Public key does not match the pinned signer");
            const raw = decode(publicKey.raw);
            if (raw.length !== 32)
                return invalid("Ed25519 public key must be 32 bytes");
            const keyBytes = new Uint8Array(raw), fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", keyBytes)), (b) => b.toString(16).padStart(2, "0")).join("");
            if (fingerprint !== pin)
                return invalid("Public key fingerprint mismatch");
            if (typeof envelope === "string") {
                if (new TextEncoder().encode(envelope).length > 1024 * 1024)
                    return invalid("Envelope exceeds 1 MiB");
                envelope = JSON.parse(envelope);
            }
            else if (new TextEncoder().encode(`${JSON.stringify(envelope, null, 2)}\n`).length >
                1024 * 1024) {
                return invalid("Envelope exceeds 1 MiB");
            }
            if (!record(envelope) ||
                envelope.payloadType !== TYPE ||
                !Array.isArray(envelope.signatures) ||
                envelope.signatures.length < 1 ||
                envelope.signatures.length > 16)
                return invalid("Unsupported or malformed DSSE envelope");
            const payload = decode(envelope.payload);
            if (payload.length > 1024 * 1024)
                return invalid("Payload exceeds 1 MiB");
            const key = await crypto.subtle.importKey("raw", keyBytes, "Ed25519", false, ["verify"]), authenticated = message(TYPE, payload);
            let verified = false;
            for (const entry of envelope.signatures) {
                if (!record(entry))
                    return invalid("Malformed DSSE signature");
                const signature = decode(entry.sig);
                if (signature.length !== 64)
                    return invalid("Ed25519 signature must be 64 bytes");
                if (await crypto.subtle.verify("Ed25519", key, new Uint8Array(signature), authenticated))
                    verified = true;
            }
            if (!verified)
                return invalid("Ed25519 signature verification failed");
            const text = new TextDecoder("utf-8", { fatal: true }).decode(payload), statement = JSON.parse(text);
            const problem = stampProblem(statement);
            if (problem)
                return invalid(problem);
            // stampProblem validated these objects; narrowing keeps the exported module dependency-free.
            if (!record(statement) || !record(statement.predicate))
                return invalid("Invalid statement");
            const passed = statement.predicate.status === "passed", capture = record(statement.predicate.capture) ? statement.predicate.capture : {};
            const reason = [
                `Signature and stamp profile valid; latest captured checks ${statement.predicate.status}`,
                ...(capture.network === "not-os-isolated"
                    ? ["supplemental test was NOT OS-network-isolated"]
                    : []),
                ...(Array.isArray(capture.policyExceptions)
                    ? [`capture sandbox widened for: ${capture.policyExceptions.join(", ")}`]
                    : []),
                ...(Array.isArray(capture.priorCaptures) && capture.priorCaptures.length
                    ? [`${capture.priorCaptures.length} earlier capture(s) retained`]
                    : []),
            ].join("; ");
            return {
                valid: true,
                reason,
                statement,
                payload: text,
                checksPassed: passed,
                keyFingerprint: fingerprint,
            };
        }
        catch (error) {
            return invalid(`Not verified: ${error instanceof Error ? error.message : "invalid input or unavailable cryptography"}`);
        }
    };
}
export const verifyStamp = createStampVerifier(PINNED_KEY_SHA256);

/**
 * RunPod GPU Pod Setup Script
 * ============================
 * Creates a RunPod GPU Pod with persistent volume for Personaplex inference.
 * Run once: npx tsx infrastructure/runpod/setup-pod.ts
 *
 * Prerequisites:
 *   - RUNPOD_API_KEY environment variable set
 *   - Docker image pushed to registry (see Dockerfile.gpu-pod)
 *
 * After running:
 *   - Note the podId from output
 *   - Set RUNPOD_POD_ID in Vercel production env
 *   - Set PERSONAPLEX_URL to https://{podId}-8998.proxy.runpod.net
 */

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
if (!RUNPOD_API_KEY) {
    console.error('Error: RUNPOD_API_KEY environment variable is required');
    process.exit(1);
}

const DOCKER_IMAGE = process.env.RUNPOD_IMAGE || 'ghcr.io/dmrcnylmz/callception-personaplex-pod:latest';
const PERSONAPLEX_API_KEY = process.env.PERSONAPLEX_API_KEY || '';
const HF_TOKEN = process.env.HF_TOKEN || '';

const RUNPOD_GQL_URL = 'https://api.runpod.io/graphql';

async function gql(query: string, variables?: Record<string, unknown>) {
    const res = await fetch(RUNPOD_GQL_URL + '?api_key=' + RUNPOD_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`RunPod API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    if (data.errors) {
        throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
    }
    return data.data;
}

async function createPod() {
    console.log('Creating RunPod GPU Pod...');
    console.log(`  Image: ${DOCKER_IMAGE}`);
    console.log(`  GPU: NVIDIA RTX A5000 (24GB)`);
    console.log(`  Volume: 50GB persistent at /workspace`);
    console.log(`  Container Disk: 20GB`);
    console.log('');

    const mutation = `
        mutation {
            podFindAndDeployOnDemand(
                input: {
                    name: "callception-personaplex"
                    imageName: "${DOCKER_IMAGE}"
                    gpuTypeId: "NVIDIA RTX A5000"
                    cloudType: "SECURE"
                    gpuCount: 1
                    volumeInGb: 50
                    containerDiskInGb: 20
                    volumeMountPath: "/workspace"
                    startJupyter: false
                    startSsh: true
                    ports: "8998/http"
                    env: [
                        { key: "HOST", value: "0.0.0.0" }
                        { key: "PORT", value: "8998" }
                        { key: "DEVICE", value: "cuda" }
                        { key: "HF_HOME", value: "/workspace/models/huggingface" }
                        { key: "HF_TOKEN", value: "${HF_TOKEN}" }
                        { key: "PERSONAPLEX_API_KEY", value: "${PERSONAPLEX_API_KEY}" }
                        { key: "MAX_SESSIONS", value: "4" }
                        { key: "SESSION_TIMEOUT", value: "300" }
                    ]
                }
            ) {
                id
                name
                desiredStatus
                imageName
                machine {
                    gpuDisplayName
                    podHostId
                }
                runtime {
                    uptimeInSeconds
                    ports {
                        ip
                        isIpPublic
                        privatePort
                        publicPort
                    }
                }
            }
        }
    `;

    const data = await gql(mutation);
    const pod = data.podFindAndDeployOnDemand;

    console.log('=== Pod Created Successfully ===');
    console.log('');
    console.log(`  Pod ID:    ${pod.id}`);
    console.log(`  Name:      ${pod.name}`);
    console.log(`  Status:    ${pod.desiredStatus}`);
    console.log(`  Image:     ${pod.imageName}`);
    if (pod.machine) {
        console.log(`  GPU:       ${pod.machine.gpuDisplayName}`);
    }
    console.log('');
    console.log('=== Next Steps ===');
    console.log('');
    console.log('1. Set Vercel environment variables:');
    console.log(`   RUNPOD_POD_ID=${pod.id}`);
    console.log(`   PERSONAPLEX_URL=https://${pod.id}-8998.proxy.runpod.net`);
    console.log('');
    console.log('2. Wait for the pod to boot and download the model (~5-10min on first start)');
    console.log('3. Test health: curl https://' + pod.id + '-8998.proxy.runpod.net/health');
    console.log('4. Stop the pod when done testing (it will auto-start when enterprise users need it):');
    console.log(`   npx tsx infrastructure/runpod/setup-pod.ts --stop ${pod.id}`);
    console.log('');

    return pod;
}

async function stopPod(podId: string) {
    console.log(`Stopping pod ${podId}...`);
    const mutation = `
        mutation {
            podStop(input: { podId: "${podId}" }) {
                id
                desiredStatus
            }
        }
    `;
    const data = await gql(mutation);
    console.log(`Pod ${data.podStop.id} → ${data.podStop.desiredStatus}`);
}

async function startPod(podId: string) {
    console.log(`Starting pod ${podId}...`);
    const mutation = `
        mutation {
            podResume(input: { podId: "${podId}", gpuCount: 1 }) {
                id
                desiredStatus
            }
        }
    `;
    const data = await gql(mutation);
    console.log(`Pod ${data.podResume.id} → ${data.podResume.desiredStatus}`);
}

async function getPodStatus(podId: string) {
    const query = `
        query {
            pod(input: { podId: "${podId}" }) {
                id
                name
                desiredStatus
                runtime {
                    uptimeInSeconds
                    ports {
                        ip
                        isIpPublic
                        privatePort
                        publicPort
                    }
                }
                machine {
                    gpuDisplayName
                }
            }
        }
    `;
    const data = await gql(query);
    const pod = data.pod;
    console.log(`Pod ${pod.id}: ${pod.desiredStatus}`);
    if (pod.runtime?.uptimeInSeconds) {
        console.log(`  Uptime: ${Math.round(pod.runtime.uptimeInSeconds / 60)}min`);
    }
    if (pod.machine) {
        console.log(`  GPU: ${pod.machine.gpuDisplayName}`);
    }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'create';
const podId = args[1] || args[0];

(async () => {
    try {
        if (command === '--stop' && podId) {
            await stopPod(podId);
        } else if (command === '--start' && podId) {
            await startPod(podId);
        } else if (command === '--status' && podId) {
            await getPodStatus(podId);
        } else if (command === 'create' || !command.startsWith('--')) {
            await createPod();
        } else {
            console.log('Usage:');
            console.log('  npx tsx infrastructure/runpod/setup-pod.ts              # Create pod');
            console.log('  npx tsx infrastructure/runpod/setup-pod.ts --stop ID    # Stop pod');
            console.log('  npx tsx infrastructure/runpod/setup-pod.ts --start ID   # Start pod');
            console.log('  npx tsx infrastructure/runpod/setup-pod.ts --status ID  # Check status');
        }
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
})();

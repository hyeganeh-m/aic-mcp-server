#!/usr/bin/env node
/**
 * Test Suite: AI Agent Administration & Development Scenarios
 * Demonstrates AI agents inspecting, administering, and configuring PingAM and PingIDM
 * via the local Ping MCP Server tools.
 */

import { listJourneysTool } from './dist/tools/am/listJourneys.js';
import { createJourneyTool } from './dist/tools/am/createJourney.js';
import { deleteJourneyTool } from './dist/tools/am/deleteJourney.js';
import { listManagedObjectsTool } from './dist/tools/managedObjects/listManagedObjects.js';
import { createManagedObjectTool } from './dist/tools/managedObjects/createManagedObject.js';
import { queryManagedObjectsTool } from './dist/tools/managedObjects/queryManagedObjects.js';
import { deleteManagedObjectTool } from './dist/tools/managedObjects/deleteManagedObject.js';

const AM_BASE_URL = process.env.AM_BASE_URL || 'http://am.ping.local:8080/am';
const IDM_BASE_URL = process.env.IDM_BASE_URL || 'http://localhost:8082/openidm';

const AM_ADMIN_USERNAME = process.env.AM_ADMIN_USERNAME || 'amadmin';
const AM_ADMIN_PASSWORD = process.env.AM_ADMIN_PASSWORD;
const IDM_ADMIN_USERNAME = process.env.IDM_ADMIN_USERNAME || 'openidm-admin';
const IDM_ADMIN_PASSWORD = process.env.IDM_ADMIN_PASSWORD;

async function getAmAdminToken() {
  if (!AM_ADMIN_PASSWORD) {
    throw new Error('AM_ADMIN_PASSWORD environment variable is required to authenticate against PingAM.');
  }
  const res = await fetch(`${AM_BASE_URL}/json/realms/root/authenticate`, {
    method: 'POST',
    headers: {
      'X-OpenAM-Username': AM_ADMIN_USERNAME,
      'X-OpenAM-Password': AM_ADMIN_PASSWORD,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to authenticate ${AM_ADMIN_USERNAME}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.tokenId;
}

async function main() {
  if (!AM_ADMIN_PASSWORD || !IDM_ADMIN_PASSWORD) {
    console.error('❌ Error: AM_ADMIN_PASSWORD and IDM_ADMIN_PASSWORD environment variables are required.');
    console.error('Usage: AM_ADMIN_PASSWORD="<password>" IDM_ADMIN_PASSWORD="<password>" node test-ai-scenarios.mjs\n');
    process.exit(1);
  }

  console.log('================================================================');
  console.log('  Ping Build with AI — Agent Administration Verification Suite  ');
  console.log('================================================================\n');

  // Authenticate
  console.log(`🔑 Authenticating as ${AM_ADMIN_USERNAME}...`);
  const ssoToken = await getAmAdminToken();
  process.env.SSO_TOKEN = ssoToken;
  process.env.AM_BASE_URL = AM_BASE_URL;
  process.env.IDM_BASE_URL = IDM_BASE_URL;
  process.env.IDM_ADMIN_USERNAME = IDM_ADMIN_USERNAME;
  process.env.IDM_ADMIN_PASSWORD = IDM_ADMIN_PASSWORD;
  console.log('   Authentication successful (SSO Token acquired)\n');

  // Scenario 1: List Journeys in /customers realm
  console.log('📋 Scenario 1: Inspecting AM Authentication Journeys (realm: customers)...');
  const journeysRes = await listJourneysTool.toolFunction({ realm: 'customers' });
  const journeysData = JSON.parse(journeysRes.content[0].text);
  const journeyIds = journeysData.result.map(j => j._id);
  console.log(`   Found ${journeyIds.length} journeys: ${journeyIds.join(', ')}`);
  if (!journeyIds.includes('SimpleLogin')) {
    throw new Error('Expected SimpleLogin journey not found in realm customers');
  }
  console.log('   ✅ Scenario 1 PASSED: Agent successfully discovered realm journeys.\n');

  // Scenario 2: List IDM Managed Objects
  console.log('📋 Scenario 2: Inspecting PingIDM Managed Object Schemas...');
  const managedRes = await listManagedObjectsTool.toolFunction();
  const managedData = JSON.parse(managedRes.content[0].text);
  console.log(`   Found managed objects: ${managedData.managedObjectTypes.join(', ')}`);
  if (!managedData.managedObjectTypes.includes('user')) {
    throw new Error('Expected "user" managed object schema in PingIDM');
  }
  console.log('   ✅ Scenario 2 PASSED: Agent successfully inspected IDM schema definitions.\n');

  // Scenario 3: Create and Query Managed Object (Identity Administration)
  const testUserId = `ai-tester-${Date.now()}`;
  console.log(`📋 Scenario 3: Provisioning Managed User (${testUserId}) in IDM...`);
  const createRes = await createManagedObjectTool.toolFunction({
    objectType: 'user',
    objectData: {
      userName: testUserId,
      givenName: 'AITester',
      sn: 'Agent',
      mail: `${testUserId}@ping.local`,
      userPassword: 'P@ssw0rd_Unique_For_Agent_123!'
    }
  });
  const createOutput = createRes.content[0].text;
  if (!createOutput.includes('Created managed object')) {
    throw new Error(`Failed to create managed user: ${createOutput}`);
  }
  const createdId = createOutput.replace('Created managed object', '').trim();
  console.log(`   Created user with internal ID: ${createdId}`);

  // Query back
  const queryRes = await queryManagedObjectsTool.toolFunction({
    objectType: 'user',
    queryString: `userName eq "${testUserId}"`
  });
  const queryData = JSON.parse(queryRes.content[0].text);
  if (!queryData.result || queryData.result.length === 0) {
    throw new Error(`Failed to query back created user ${testUserId}`);
  }
  console.log(`   Verified retrieval: userName=${queryData.result[0].userName}, mail=${queryData.result[0].mail}`);

  // Cleanup user
  await deleteManagedObjectTool.toolFunction({
    objectType: 'user',
    objectId: createdId
  });
  console.log('   Cleaned up test user.');
  console.log('   ✅ Scenario 3 PASSED: Agent successfully administered user lifecycle.\n');

  // Scenario 4: Author and Deploy an Authentication Journey (AM Development)
  const testJourneyName = `AgentJourney_${Date.now()}`;
  console.log(`📋 Scenario 4: Authoring & Deploying Journey (${testJourneyName}) in /customers...`);
  const createTreeRes = await createJourneyTool.toolFunction({
    realm: 'customers',
    journeyName: testJourneyName,
    description: 'Dynamic journey deployed by AI developer agent',
    journeyData: {
      entryNodeId: 'login-collector',
      nodes: {
        'login-collector': {
          nodeType: 'PageNode',
          displayName: 'AI Authenticator Page',
          connections: {
            outcome: 'success'
          },
          config: {
            pageDescription: {},
            pageHeader: {}
          }
        }
      }
    }
  });
  const createTreeData = JSON.parse(createTreeRes.content[0].text);
  console.log(`   Journey deployed: ${createTreeData.journeyName}`);
  console.log(`   Generated UUID node mappings:`, createTreeData.nodeIdMapping);

  // Verify journey listing
  const verifyJourneys = await listJourneysTool.toolFunction({ realm: 'customers' });
  const verifyData = JSON.parse(verifyJourneys.content[0].text);
  if (!verifyData.result.some(j => j._id === testJourneyName)) {
    throw new Error(`Deployed journey ${testJourneyName} not found in AM tree catalog`);
  }
  console.log('   Verified journey exists in PingAM realm tree catalog.');

  // Scenario 5: Delete Journey (Decommissioning)
  console.log(`📋 Scenario 5: Decommissioning Journey (${testJourneyName})...`);
  const deleteTreeRes = await deleteJourneyTool.toolFunction({
    realm: 'customers',
    journeyName: testJourneyName
  });
  const deleteTreeData = JSON.parse(deleteTreeRes.content[0].text);
  console.log(`   Result: ${deleteTreeData.message}`);
  console.log('   ✅ Scenarios 4 & 5 PASSED: Agent successfully deployed, verified, and decommissioned journey.\n');

  console.log('================================================================');
  console.log('  All AI Agent Administration & Development Scenarios PASSED!   ');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ Execution error:', err);
  process.exit(1);
});

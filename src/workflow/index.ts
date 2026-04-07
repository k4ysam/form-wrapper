/**
 * Backward-compatibility shim.
 * `buildSteps` and `runWorkflow` are kept here so existing callers
 * (e.g. any direct script usage) continue to work without change.
 * The orchestrator uses the per-section builders from each agent file directly.
 */

import { Page } from "playwright";
import { Step, runEngine } from "../engine";
import { WorkflowInput } from "./types";
import {
  makeFillStep,
  makeOpenSectionStep,
  makeSelectStep,
} from "./helpers";

export * from "./types";

export function buildSteps(input: WorkflowInput): Step[] {
  return [
    {
      name: "navigate",
      observe: async () => true,
      act: async (page) => {
        await page.waitForSelector("#firstName", { timeout: 10000, state: "visible" });
      },
      verify: async (page) => {
        const visible = await page.locator("#firstName").isVisible();
        if (!visible) throw new Error("#firstName is not visible after navigation");
      },
    },

    // Section 1: Personal Information
    makeFillStep("fillFirstName", ["#firstName", "input[name='firstName']", "label:has-text('First Name') + input"], () => input.firstName),
    makeFillStep("fillLastName", ["#lastName", "input[name='lastName']", "label:has-text('Last Name') + input"], () => input.lastName),
    makeFillStep("fillDateOfBirth", ["#dateOfBirth", "input[name='dateOfBirth']", "label:has-text('Date of Birth') + input"], () => input.dateOfBirth),
    makeFillStep("fillMedicalId", ["#medicalId", "input[name='medicalId']", "label:has-text('Medical ID') + input"], () => input.medicalId),

    // Section 2: Medical Information
    makeOpenSectionStep("Medical Information", "#gender"),
    makeSelectStep("selectGender", "#gender", () => input.gender),
    makeSelectStep("selectBloodType", "#bloodType", () => input.bloodType),
    makeFillStep("fillAllergies", ["#allergies", "textarea[name='allergies']"], () => input.allergies),
    makeFillStep("fillMedications", ["#medications", "textarea[name='medications']"], () => input.medications),

    // Section 3: Emergency Contact
    makeOpenSectionStep("Emergency Contact", "#emergencyContact"),
    makeFillStep("fillEmergencyContact", ["#emergencyContact", "input[name='emergencyContact']"], () => input.emergencyContact),
    makeFillStep("fillEmergencyPhone", ["#emergencyPhone", "input[name='emergencyPhone']"], () => input.emergencyPhone),

    // Submit
    {
      name: "submit",
      observe: async (page) => page.locator("button[type='submit']").isVisible(),
      act: async (page) => { await page.click("button[type='submit']"); },
      verify: async (page) => { await page.waitForTimeout(500); },
    },
    {
      name: "verifySuccess",
      observe: async () => true,
      act: async () => {},
      verify: async (page) => {
        try {
          await page.waitForSelector("text=Form submitted successfully", { timeout: 5000 });
        } catch {
          const submitGone = (await page.locator("button[type='submit']").count()) === 0;
          if (!submitGone) throw new Error("Success indicator not found and submit button still present");
        }
      },
    },
  ];
}

export async function runWorkflow(page: Page, input: WorkflowInput): Promise<void> {
  await runEngine(page, buildSteps(input));
}

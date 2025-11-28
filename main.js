const { remote } = require("webdriverio");
const { authenticator } = require("otplib");
const fs = require("fs");
const path = require("path");
const chromedriver = require("chromedriver");
require("dotenv").config();

// Common selectors
const SELECTORS = {
  SUBMIT_BTN: "/html/body/main/section/section/div[2]/div/div/div/div[3]/button[2]",
  CANCEL_BTN: '//button[.//span[@class="btn-text" and text()="Cancel"]]',
  GENERATE_SOLUTION_BTN: "button.btn-standard.primary.call-to-action.generate-btn.btn-gradient-secondary",
  RATING_INPUT: "input[type='tel']",
};

// Common timeouts (in milliseconds)
const TIMEOUTS = {
  DEFAULT_CLICK: 30000,
  QUICK_WAIT: 1000,
  MEDIUM_WAIT: 2000,
  LONG_WAIT: 5000,
  STANDARD_WAIT: 10000,
  LOADING_SCREEN: 60000,
  EXTENDED_LOADING: 120000,
};

// Selector arrays for multi-selector button clicks
const BUTTON_SELECTORS = {
  CONTINUE: ["button=Continue", "//button[text()='Continue']", "//button[contains(text(), 'Continue')]", "//div[@class='view-modal-container']//button[contains(., 'Continue')]"],
  FEEDBACK_DISMISS: ["//button[contains(text(), 'Do not show this again')]", "//button[text()='Do not show this again']", ".ea-dialog-view button:last-child", "//div[contains(@class, 'ea-dialog-view')]//button[last()]"],
  AUTOFILL: ["//button[contains(text(), 'SBC squad autofill')]", "button.fce-button", ".sbc-button-container button", "//button[contains(@class, 'btn-standard') and contains(text(), 'autofill')]"],
  OK_BUTTON: ["//button[text()='Ok']", "//button[text()='OK']", "button.btn-standard.primary", ".ea-dialog-view button.btn-standard.primary", "//button[contains(@class, 'btn-standard primary')]"],
};

const btnClick = async (browser, path, timeout = TIMEOUTS.DEFAULT_CLICK) => {
  const btn = await browser.$(path);
  await btn.waitForClickable({ timeout });
  await btn.click();
};

const textFill = async (browser, path, text, timeout = TIMEOUTS.DEFAULT_CLICK) => {
  const textField = await browser.$(path);
  await textField.waitForEnabled({ timeout: timeout });
  await textField.setValue(text);
};

const closeNewTab = async (browser) => {
  // Close any new tab that might have opened before starting the main script
  await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 2, {
    timeout: TIMEOUTS.LONG_WAIT, // Adjust the timeout as needed
    timeoutMsg: "Expected two browser tabs to be open",
    interval: 1000, // Frequency of checks
  });

  // Close the new tab and switch back to the original tab
  const handles = await browser.getWindowHandles();
  await browser.switchToWindow(handles[1]);
  await browser.closeWindow();
  await browser.switchToWindow(handles[0]);
};

// Function to wait for any loading screens to disappear
const waitForLoadingShield = async (browser, timeout = TIMEOUTS.LOADING_SCREEN) => {
  try {
    await browser.waitUntil(
      async () => {
        // Check for FSU-specific loading overlay
        const fsuLoading = await browser.$("div.ut-click-shield.showing.fsu-loading");
        if ((await fsuLoading.isExisting()) && (await fsuLoading.isDisplayed())) {
          return false;
        }

        // Check for EA's general loading overlay
        const loadingOverlay = await browser.$("div.ut-click-shield.showing");
        if ((await loadingOverlay.isExisting()) && (await loadingOverlay.isDisplayed())) {
          return false;
        }

        // Check for "Reading player data" text
        const readingPlayerData = await browser.$$('//*[contains(text(), "Reading player data")]');
        if (readingPlayerData.length > 0) {
          const isVisible = await readingPlayerData[0].isDisplayed();
          if (isVisible) {
            return false;
          }
        }

        return true;
      },
      {
        timeout,
        timeoutMsg: "Expected loading screens to disappear",
        interval: 1000,
      }
    );
  } catch (e) {
    // Timeout or no loading screen found - continue
    console.log("Loading screen wait completed or timed out");
  }
};

// Helper function to click a button trying multiple selectors
const clickButtonWithSelectors = async (browser, selectors, actionName = "button") => {
  for (const selector of selectors) {
    try {
      const btn = await browser.$(selector);
      if ((await btn.isExisting()) && (await btn.isDisplayed())) {
        await btn.click();
        console.log(`Clicked ${actionName} with selector: ${selector}`);
        return true;
      }
    } catch (e) {
      continue;
    }
  }
  console.log(`${actionName} not found`);
  return false;
};

// Function to dismiss Feedback modal if it appears
const dismissFeedbackModal = async (browser) => {
  try {
    // Check if Feedback modal exists by looking for the heading or text
    const feedbackText = await browser.$("//*[contains(text(), 'Feedback')]");
    const feedbackExists = (await feedbackText.isExisting()) && (await feedbackText.isDisplayed());

    if (feedbackExists) {
      console.log("Feedback modal detected, attempting to dismiss...");
      const dismissed = await clickButtonWithSelectors(browser, BUTTON_SELECTORS.FEEDBACK_DISMISS, "feedback modal dismiss button");
      await browser.pause(dismissed ? 1000 : 0);

      if (!dismissed) {
        console.log("Trying Escape key...");
        await browser.keys("Escape");
        await browser.pause(TIMEOUTS.QUICK_WAIT / 2);
      }
    }
  } catch (e) {
    // Silently continue if no modal found
  }
};

// Function to dismiss "Priceless player tips" modal if it appears
const dismissPricelessPlayerTipsModal = async (browser) => {
  try {
    const pricelessText = await browser.$("//*[contains(text(), 'Priceless player tips')]");
    if ((await pricelessText.isExisting()) && (await pricelessText.isDisplayed())) {
      console.log("Priceless player tips modal detected, clicking Continue...");

      const clicked = await clickButtonWithSelectors(browser, BUTTON_SELECTORS.CONTINUE, "Continue button");

      if (clicked) {
        // Wait for modal to actually dismiss
        try {
          await browser.waitUntil(
            async () => {
              const modal = await browser.$(".view-modal-container");
              return !(await modal.isDisplayed());
            },
            {
              timeout: TIMEOUTS.LONG_WAIT,
              interval: 500,
            }
          );
          console.log("Priceless player tips modal dismissed successfully");
          await browser.pause(TIMEOUTS.QUICK_WAIT);
        } catch (e) {
          console.log("Modal may still be present, continuing...");
        }
      }
    }
  } catch (e) {
    // Silently continue if no modal found
  }
};

// Function to sign into Enhancer
const signIntoEnhancer = async (browser) => {
  try {
    console.log("Checking if Enhancer sign-in is required...");

    // Check if the Enhancer sign-in button exists
    const enhancerBtn = await browser.$("/html/body/main/section/section/div[1]/div[2]/button");

    try {
      await enhancerBtn.waitForExist({ timeout: TIMEOUTS.STANDARD_WAIT });
    } catch (e) {
      console.log("Enhancer sign-in button not found - already signed in");
      await browser.pause(TIMEOUTS.QUICK_WAIT);
      return;
    }

    const isVisible = await enhancerBtn.isDisplayed();
    if (!isVisible) {
      console.log("Enhancer already signed in");
      await browser.pause(TIMEOUTS.QUICK_WAIT);
      return;
    }

    // Check button text to determine if we need to sign in or if already signed in
    const buttonText = await enhancerBtn.getText();
    if (buttonText && buttonText.toLowerCase().includes("sign out")) {
      console.log("Enhancer already signed in (Sign Out button detected)");
      await browser.pause(TIMEOUTS.MEDIUM_WAIT);
      return;
    }

    console.log("Signing into Enhancer...");
    await enhancerBtn.click();
    await browser.pause(TIMEOUTS.LONG_WAIT);

    // Wait for the email input to be present and enabled
    const emailInput = await browser.$("section input:first-of-type");
    await emailInput.waitForExist({ timeout: TIMEOUTS.STANDARD_WAIT });
    await emailInput.waitForEnabled({ timeout: TIMEOUTS.STANDARD_WAIT });
    await emailInput.setValue(process.env.ENHANCERUSR || process.env.MAINEMAIL);
    await browser.pause(500);

    const passwordInput = await browser.$("input[type='password']");
    await passwordInput.waitForExist({ timeout: TIMEOUTS.LONG_WAIT });
    await passwordInput.waitForEnabled({ timeout: TIMEOUTS.LONG_WAIT });
    await passwordInput.setValue(process.env.ENHANCERPWD);
    await browser.pause(500);

    const submitBtn = await browser.$("//button[contains(text(), 'Login')]");
    await submitBtn.waitForClickable({ timeout: TIMEOUTS.LONG_WAIT });
    await submitBtn.click();

    console.log("Enhancer sign-in complete");
    await browser.pause(TIMEOUTS.LONG_WAIT);

    // Wait for any EA loading screens to complete after sign-in
    console.log("Waiting for all loading screens to complete after sign-in...");
    await waitForLoadingShield(browser, 120000);
    console.log("All loading screens finished!");
    await browser.pause(TIMEOUTS.MEDIUM_WAIT);
  } catch (error) {
    console.log("Enhancer sign-in failed:", error.message);
    console.log("Assuming Enhancer is already signed in, continuing...");
    await browser.pause(TIMEOUTS.MEDIUM_WAIT);
    // Don't throw - just log and continue, in case we're already signed in
  }
};

// Helper function to set rating inputs (min and max)
const setRatingInputs = async (browser, minRating = "10", maxRating = "82") => {
  await browser.pause(TIMEOUTS.MEDIUM_WAIT);
  const allRatingInputs = await browser.$$(SELECTORS.RATING_INPUT);
  console.log(`Found ${allRatingInputs.length} rating input elements`);

  let inputsSet = 0;
  for (let i = 0; i < allRatingInputs.length && inputsSet < 2; i++) {
    try {
      const input = allRatingInputs[i];
      if (await input.isDisplayed()) {
        const value = inputsSet === 0 ? minRating : maxRating;
        await input.click();
        await browser.pause(200);
        await browser.keys(["Control", "a"]);
        await browser.pause(100);
        await browser.keys(value);
        console.log(`Set input ${i + 1} to ${value} (${inputsSet === 0 ? "minimum" : "maximum"})`);
        inputsSet++;
      }
    } catch (e) {
      console.log(`Error setting input ${i + 1}:`, e.message);
      continue;
    }
  }

  if (inputsSet > 0) {
    await browser.pause(100);
    await browser.keys("Enter");
    console.log("Rating inputs configured, pressed Enter");
    await browser.pause(TIMEOUTS.MEDIUM_WAIT); // Wait for modal to appear
  } else {
    console.log("Could not set rating inputs");
  }
};

// Function to perform rating input flow (used in fallback scenarios)
const performRatingInputFlow = async (browser) => {
  await browser.waitUntil(async () => await browser.$(SELECTORS.GENERATE_SOLUTION_BTN).isDisplayed(), {
    timeout: TIMEOUTS.LOADING_SCREEN,
    timeoutMsg: "Expected 'Generate Solution' button to be displayed",
    interval: 1000,
  });
  await browser.keys("J");
  await setRatingInputs(browser);

  // Wait for either Cancel button (no players) or Submit button to be enabled (players found)
  await browser.waitUntil(
    async () => {
      // Check if Cancel button appeared (no players available)
      const cancelBtn = await browser.$(SELECTORS.CANCEL_BTN);
      if ((await cancelBtn.isExisting()) && (await cancelBtn.isDisplayed())) {
        return true;
      }

      // Check if Submit button is enabled (players found)
      const submitBtn = await browser.$(SELECTORS.SUBMIT_BTN);
      if ((await submitBtn.isExisting()) && (await submitBtn.isEnabled())) {
        return true;
      }

      return false;
    },
    {
      timeout: TIMEOUTS.STANDARD_WAIT + TIMEOUTS.LONG_WAIT, // 15 seconds
      timeoutMsg: "Neither Cancel button nor enabled Submit button appeared after rating inputs",
      interval: 500,
    }
  );

  await waitForLoadingShield(browser);

  // Check which scenario we're in and handle accordingly
  const cancelBtn = await browser.$(SELECTORS.CANCEL_BTN);
  if ((await cancelBtn.isExisting()) && (await cancelBtn.isDisplayed())) {
    console.log("No players available, clicking Cancel button");
    await safeBtnClick(browser, SELECTORS.CANCEL_BTN, TIMEOUTS.LONG_WAIT);
  } else {
    console.log("Players found, Submit button should be enabled");
    // Submit button will be handled by the calling function
  }
};

// Function to handle button clicks with error handling
const safeBtnClick = async (browser, selector, timeout = TIMEOUTS.LONG_WAIT) => {
  try {
    await btnClick(browser, selector, timeout);
  } catch (error) {
    console.log(`Button not found or not clickable (selector: ${selector}), checking for feedback modal...`);
    // Check for and dismiss feedback modal that might be blocking
    await dismissFeedbackModal(browser);
  }
};

// Function to handle SBC submission attempts
const attemptSBCSubmission = async (browser, sbcName, type, maxAttempts = 50, submitAttempts = 0) => {
  while (submitAttempts < maxAttempts) {
    try {
      const submitBtn = await browser.$(SELECTORS.SUBMIT_BTN);
      await submitBtn.waitForExist({ timeout: TIMEOUTS.STANDARD_WAIT });

      const isEnabled = await submitBtn.isEnabled();
      if (!isEnabled) {
        throw new Error("Submit button is not enabled");
      }

      await submitBtn.click();
      console.log("Submit button clicked, waiting for confirmation...");
      await browser.pause(TIMEOUTS.LONG_WAIT);

      // Check and handle "Priceless player tips" warning modal if it appears
      const modalContainer = await browser.$(".view-modal-container");
      const isModalPresent = (await modalContainer.isExisting()) && (await modalContainer.isDisplayed());

      if (isModalPresent) {
        console.log("Modal detected after submission, checking for 'Priceless player tips'...");

        // Check if it's the "Priceless player tips" modal
        const pricelessText = await browser.$("//*[contains(text(), 'Priceless player tips')]");
        const isPricelessModal = (await pricelessText.isExisting()) && (await pricelessText.isDisplayed());

        if (isPricelessModal) {
          console.log("'Priceless player tips' warning modal detected, attempting to dismiss...");

          const buttonClicked = await clickButtonWithSelectors(browser, BUTTON_SELECTORS.CONTINUE, "Continue button");

          if (!buttonClicked) {
            console.log("WARNING: Could not click Continue button, trying Escape key...");
            await browser.keys("Escape");
            await browser.pause(TIMEOUTS.QUICK_WAIT);
          }

          // Verify modal is dismissed
          try {
            await browser.waitUntil(
              async () => {
                const modal = await browser.$(".view-modal-container");
                return !(await modal.isDisplayed());
              },
              {
                timeout: TIMEOUTS.LONG_WAIT * 2,
                timeoutMsg: "Modal still present after dismiss attempt",
                interval: 500,
              }
            );
            console.log("Modal successfully dismissed");
          } catch (modalError) {
            console.log("ERROR: Modal still blocking page, throwing error to retry...");
            throw new Error("Modal blocking page after dismiss attempt");
          }
        } else {
          console.log("Unknown modal detected, trying Escape key...");
          await browser.keys("Escape");
          await browser.pause(TIMEOUTS.QUICK_WAIT);
        }
      } else {
        console.log("No modal detected, submission successful");
      }

      // Wait a moment for submission to process
      await browser.pause(TIMEOUTS.MEDIUM_WAIT + TIMEOUTS.QUICK_WAIT);
      console.log("Submission processed successfully");
      break; // Exit loop if successful
    } catch (error) {
      console.log(`Submission attempt ${submitAttempts + 1} failed: ${error.message}`);
      submitAttempts++;
      if (submitAttempts >= maxAttempts) {
        throw new Error("Failed to submit SBC after multiple attempts");
      }

      try {
        await handleFailedSBCSubmission(browser, sbcName, type, submitAttempts);
      } catch (recoveryError) {
        console.log(`Recovery attempt ${submitAttempts} failed: ${recoveryError.message}`);
        console.log("Attempting to navigate back and restart challenge...");

        // Try to navigate back to SBC overview and re-enter the challenge
        try {
          // Close any modals first
          await browser.keys("Escape");
          await browser.pause(TIMEOUTS.QUICK_WAIT);
          await dismissFeedbackModal(browser);

          // Click back button multiple times if needed to get to SBC overview
          for (let i = 0; i < 3; i++) {
            const backBtn = await browser.$("button.ut-navigation-button-control");
            if ((await backBtn.isExisting()) && (await backBtn.isDisplayed())) {
              await backBtn.click();
              console.log(`Clicked back button (attempt ${i + 1})`);
              await browser.pause(1500);

              // Check if we're at the right screen
              const challengeHeader = await browser.$(`//h1[text()="${sbcName}"]`);
              if ((await challengeHeader.isExisting()) && (await challengeHeader.isDisplayed())) {
                console.log("Found challenge header, attempting to re-enter...");
                break;
              }
            } else {
              break;
            }
          }

          await browser.pause(TIMEOUTS.QUICK_WAIT);

          // Try to click the challenge to re-enter
          const challengeSelectors = [`//h1[text()="${sbcName}"]`, `//button[contains(text(), "${sbcName}")]`, `//div[contains(@class, 'sbc-challenge')]//h1[contains(text(), "${sbcName.split(" ")[0]}")]`];

          let challengeClicked = false;
          for (const selector of challengeSelectors) {
            try {
              const challengeBtn = await browser.$(selector);
              if ((await challengeBtn.isExisting()) && (await challengeBtn.isDisplayed())) {
                await challengeBtn.click();
                console.log(`Re-entered challenge using selector: ${selector}`);
                challengeClicked = true;
                await browser.pause(TIMEOUTS.MEDIUM_WAIT);
                break;
              }
            } catch (e) {
              console.log(`Challenge selector ${selector} failed`);
            }
          }

          if (challengeClicked) {
            // Now look for Start Challenge or Go to Challenge
            const startBtn = await browser.$('//button[text()="Start Challenge"]');
            const goToBtn = await browser.$('//button[text()="Go to Challenge"]');

            if ((await startBtn.isExisting()) && (await startBtn.isDisplayed())) {
              console.log("Starting challenge fresh...");
              await safeBtnClick(browser, '//button[text()="Start Challenge"]');
              await browser.pause(TIMEOUTS.MEDIUM_WAIT);
            } else if ((await goToBtn.isExisting()) && (await goToBtn.isDisplayed())) {
              console.log("Going to challenge...");
              await safeBtnClick(browser, '//button[text()="Go to Challenge"]');
              await browser.pause(TIMEOUTS.MEDIUM_WAIT);
            }
          } else {
            console.log("Could not re-enter challenge, will retry from current state...");
          }
        } catch (restartError) {
          console.log("Failed to restart challenge:", restartError.message);
        }
      }
    }
  }
};

// Function to handle failed SBC submission logic
const handleFailedSBCSubmission = async (browser, sbcName, type, attempt) => {
  // Check for and dismiss Feedback modal first
  await dismissFeedbackModal(browser);

  try {
    await closeNewTab(browser);
  } catch (error) {
    console.log("No extra tab to close, continuing...");
  }

  // Check again for Feedback modal after closing tab
  await dismissFeedbackModal(browser);

  // Check if Cancel button exists (no players) or just continue if Submit is ready
  const cancelBtn = await browser.$(SELECTORS.CANCEL_BTN);
  if ((await cancelBtn.isExisting()) && (await cancelBtn.isDisplayed())) {
    console.log("Clicking Cancel button to close modal");
    await safeBtnClick(browser, SELECTORS.CANCEL_BTN, TIMEOUTS.LONG_WAIT);
  }

  // Step 1: Click "SBC squad autofill" button
  console.log(`Attempt ${attempt}: Clicking SBC squad autofill button...`);
  const autofillClicked = await clickButtonWithSelectors(browser, BUTTON_SELECTORS.AUTOFILL, "autofill button");
  if (autofillClicked) await browser.pause(TIMEOUTS.MEDIUM_WAIT);

  // Step 2: Click OK button in the modal
  console.log(`Attempt ${attempt}: Clicking OK button...`);
  const okClicked = await clickButtonWithSelectors(browser, BUTTON_SELECTORS.OK_BUTTON, "OK button");
  if (okClicked) await browser.pause(TIMEOUTS.MEDIUM_WAIT);

  // Step 3: Wait for "Buy concept players in bulk" button to appear and click it
  console.log(`Attempt ${attempt}: Waiting for 'Buy concept players in bulk' button...`);

  try {
    await browser.waitUntil(
      async () => {
        const buyBtn = await browser.$("//button[contains(text(), 'Buy concept players in bulk')]");
        return (await buyBtn.isExisting()) && (await buyBtn.isDisplayed());
      },
      {
        timeout: TIMEOUTS.STANDARD_WAIT * 2, // 20 seconds
        timeoutMsg: "Buy concept players in bulk button did not appear",
        interval: 1000,
      }
    );

    console.log("'Buy concept players in bulk' button appeared, clicking...");
    await btnClick(browser, "//button[contains(text(), 'Buy concept players in bulk')]", TIMEOUTS.LONG_WAIT);
    console.log("Clicked 'Buy concept players in bulk' button");
    await browser.pause(TIMEOUTS.MEDIUM_WAIT);
  } catch (e) {
    console.log("'Buy concept players in bulk' button not found - autofill may have failed");
    console.log("Checking if we're on squad builder to try manual approach...");

    // Check if we're back on squad builder (Generate Solution button exists)
    const generateBtn = await browser.$(SELECTORS.GENERATE_SOLUTION_BTN);
    if ((await generateBtn.isExisting()) && (await generateBtn.isDisplayed())) {
      console.log("On squad builder, skipping to rating input flow...");
      await performRatingInputFlow(browser);
      return; // Exit the recovery function early
    } else {
      console.log("Not on squad builder either, continuing with recovery flow...");
    }
  }

  // Step 4: Wait for the loading screen to finish
  console.log(`Attempt ${attempt}: Waiting for loading screen to complete...`);
  await waitForLoadingShield(browser, 60000); // Reduced from 120s to 60s
  console.log("Loading screen finished!");
  await browser.pause(TIMEOUTS.QUICK_WAIT);

  // Check for Feedback modal after loading
  await dismissFeedbackModal(browser);

  // Check for "Priceless player tips" modal that might be blocking from previous attempt
  await dismissPricelessPlayerTipsModal(browser);

  // Step 5: Check if Submit button is enabled, if yes use attemptSBCSubmission, otherwise do rating input flow
  console.log(`Attempt ${attempt}: Checking Submit button status...`);

  try {
    const submitBtn = await browser.$(SELECTORS.SUBMIT_BTN);
    await submitBtn.waitForExist({ timeout: TIMEOUTS.STANDARD_WAIT }); // Reduced from 15s to 10s

    const isEnabled = await submitBtn.isEnabled();

    if (isEnabled) {
      console.log("Submit button is enabled, will handle submission with modal detection...");
      // Don't click directly - just return to let the retry mechanism continue
      // The attemptSBCSubmission function will be called again by the retry loop
      return;
    } else {
      console.log("Submit button is disabled, performing rating input flow...");
      await performRatingInputFlow(browser);
    }
  } catch (e) {
    console.log("Submit button not found after recovery, checking if we need to restart challenge...", e.message);

    // Check if we're on the challenge overview screen instead of squad builder
    const startChallengeBtn = await browser.$('//button[text()="Start Challenge"]');
    const goToChallengeBtn = await browser.$('//button[text()="Go to Challenge"]');

    if ((await startChallengeBtn.isExisting()) || (await goToChallengeBtn.isExisting())) {
      console.log("Back at challenge overview, restarting challenge...");
      if (await startChallengeBtn.isExisting()) {
        await safeBtnClick(browser, '//button[text()="Start Challenge"]');
      } else {
        await safeBtnClick(browser, '//button[text()="Go to Challenge"]');
      }
      await browser.pause(TIMEOUTS.MEDIUM_WAIT);

      // Now try the rating input flow
      await performRatingInputFlow(browser);
    } else {
      console.log("Unknown state, checking for blocking modals...");
      await dismissFeedbackModal(browser);

      // Check if Generate Solution button exists (we're on squad builder)
      const generateBtn = await browser.$(SELECTORS.GENERATE_SOLUTION_BTN);
      if ((await generateBtn.isExisting()) && (await generateBtn.isDisplayed())) {
        console.log("On squad builder screen, trying rating input flow...");
        await performRatingInputFlow(browser);
      } else {
        console.log("Not on squad builder screen, recovery failed. Throwing error to retry from challenge start...");
        throw new Error("Recovery flow failed - not on squad builder screen");
      }
    }
  }
};
(async () => {
  var args = process.argv.slice(2);
  const numOfTimes = args[0] ? parseInt(args[0]) : 1;
  const type = args[1] ? args[1] : "league";

  const startTime = Date.now();

  // Start ChromeDriver
  const chromedriverPath = chromedriver.path;
  console.log("ChromeDriver path:", chromedriverPath);

  // Set up WebDriverIO configuration
  const browser = await remote({
    logLevel: "error",
    capabilities: {
      browserName: "chrome",
      "goog:chromeOptions": {
        extensions: [fs.readFileSync(path.resolve("./FC26-Enhancer-SBC-Solver-Trader-Keyboard-Shortcuts-Chrome-Web-Store.crx")).toString("base64"), fs.readFileSync(path.resolve("./Tampermonkey-Chrome-Web-Store.crx")).toString("base64")],
        args: ["--window-size=1300,1400"],
      },
    },
  });

  await closeNewTab(browser);

  await browser.url("chrome://extensions/");
  // Combine both extension operations into one execute call
  await browser.execute(() => {
    const extensionsManager = document.querySelector("body > extensions-manager").shadowRoot;
    const toolbar = extensionsManager.querySelector("#toolbar").shadowRoot;
    const devModeButton = toolbar.querySelector("#devMode");
    const updateNowButton = toolbar.querySelector("#updateNow");
    devModeButton.click();
    updateNowButton.click();
  });

  await closeNewTab(browser);

  // Read script file once before the loop
  const scriptContent = fs.readFileSync(path.resolve("./fsu.js"), "utf-8");

  let attempts = 0;
  const maxAttempts = 100;
  while (attempts < maxAttempts) {
    try {
      await browser.url("chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/options.html#nav=new-user-script+editor");
      await browser.execute((content) => {
        const editor = document.querySelector(".CodeMirror").CodeMirror;
        editor.setValue(content);
      }, scriptContent);
      await browser.keys(["Control", "s"]);
      break; // Exit loop if successful
    } catch (error) {
      attempts++;
      if (attempts <= maxAttempts) {
        await browser.url("chrome://extensions/");
        await browser.execute(() => {
          const extensionsManager = document.querySelector("body > extensions-manager").shadowRoot;
          const toolbar = extensionsManager.querySelector("#toolbar").shadowRoot;
          const updateNowButton = toolbar.querySelector("#updateNow");
          updateNowButton.click();
        });
        await closeNewTab(browser);
      }
    }
  }

  // Load the page at the very beginning
  await browser.url("https://www.ea.com/ea-sports-fc/ultimate-team/web-app/");

  // Wait a moment to check if already logged in
  await browser.pause(TIMEOUTS.LONG_WAIT);

  // Check if login button exists - if it does, we need to log in
  const loginButtonExists = await browser.$('//*[@id="Login"]/div/div/button[1]').isExisting();

  if (!loginButtonExists) {
    console.log("Already logged in, skipping login process");
  } else {
    console.log("Not logged in, proceeding with login...");

    // Perform login actions
    try {
      await btnClick(browser, '//*[@id="Login"]/div/div/button[1]', TIMEOUTS.STANDARD_WAIT);
      await textFill(browser, '//*[@id="email"]', process.env.MAINEMAIL);
      await btnClick(browser, '//*[@id="logInBtn"]');
      await textFill(browser, '//*[@id="password"]', process.env.MAINPASSWORD);
      await btnClick(browser, '//*[@id="logInBtn"]');

      // Check if 2FA is needed
      await browser.pause(TIMEOUTS.MEDIUM_WAIT);
      const twoFAExists = await browser.$('//*[@id="APPLabel"]').isExisting();

      if (twoFAExists) {
        console.log("2FA required, proceeding...");
        await btnClick(browser, '//*[@id="APPLabel"]');
        await btnClick(browser, '//*[@id="btnSendCode"]');
        const token = authenticator.generate(process.env.GTOP);
        await textFill(browser, '//*[@id="twoFactorCode"]', token);
        console.log("Submitting 2FA code (single attempt only)...");
        await btnClick(browser, '//*[@id="btnSubmit"]');
        await browser.pause(TIMEOUTS.MEDIUM_WAIT);
      } else {
        console.log("No 2FA required or already passed");
      }
    } catch (error) {
      console.log("Login error (might already be logged in):", error.message);
    }
  }

  // Wait for the web app to fully load
  console.log("Waiting for EA Web App to load...");
  await browser.waitUntil(
    async () => {
      const url = await browser.getUrl();
      return url.includes("ea.com/ea-sports-fc/ultimate-team/web-app");
    },
    {
      timeout: TIMEOUTS.LOADING_SCREEN,
      timeoutMsg: "Expected EA Web App to load",
      interval: 2000,
    }
  );

  // Wait for the "Reading player data" loading screen to complete
  console.log("Waiting for player data to load...");
  await browser.waitUntil(
    async () => {
      // Check if loading text is gone
      const loadingTexts = await browser.$$('//*[contains(text(), "Reading player data")]');
      if (loadingTexts.length > 0) {
        const isVisible = await loadingTexts[0].isDisplayed();
        return !isVisible;
      }
      return true; // If text doesn't exist, assume loading is done
    },
    {
      timeout: TIMEOUTS.LOADING_SCREEN,
      timeoutMsg: "Player data loading took too long",
      interval: 1000,
    }
  );

  // Small buffer to ensure everything is settled
  await browser.pause(TIMEOUTS.MEDIUM_WAIT);

  //开干
  try {
    // Wait for "Reading player data" loading screen to appear, then click it to dismiss
    console.log("Waiting for 'Reading player data' screen to appear...");
    await browser.waitUntil(
      async () => {
        const readingPlayerData = await browser.$$('//*[contains(text(), "Reading player data")]');
        if (readingPlayerData.length > 0) {
          return await readingPlayerData[0].isDisplayed();
        }
        return false;
      },
      {
        timeout: TIMEOUTS.DEFAULT_CLICK,
        timeoutMsg: "'Reading player data' screen did not appear",
        interval: 1000,
      }
    );

    console.log("'Reading player data' screen found, clicking to dismiss...");
    await browser.pause(TIMEOUTS.QUICK_WAIT);

    // Click on the loading screen to dismiss it
    const readingPlayerDataText = await browser.$('//*[contains(text(), "Reading player data")]');
    await readingPlayerDataText.click();

    console.log("Loading screen dismissed, waiting for it to close...");
    await browser.pause(TIMEOUTS.MEDIUM_WAIT);

    // Enhancer sign-in
    await signIntoEnhancer(browser);

    // Dismiss any popups that might appear after sign-in
    console.log("Checking for popups...");
    const popupSelectors = [
      '//button[text()="Do not show this again"]',
      '//button[contains(text(), "Do not show this again")]',
      '//button[text()="Remind me later"]',
      '//button[contains(text(), "Remind me later")]',
      '//button[text()="Next"]',
      '//button[contains(text(), "Next")]',
      '//button[text()="OK"]',
      '//button[text()="Got it"]',
      '//button[contains(text(), "Close")]',
      '//button[contains(text(), "Dismiss")]',
      "button.close",
      'button[aria-label="Close"]',
      ".modal button",
      'div[role="dialog"] button',
    ];
    const dismissed = await clickButtonWithSelectors(browser, popupSelectors, "popup");
    if (dismissed) await browser.pause(TIMEOUTS.QUICK_WAIT);

    // Click Enhancer settings button (10th nav button)
    console.log("Opening Enhancer settings...");
    const enhancerBtn = await browser.$("nav button:nth-child(10)");
    await enhancerBtn.waitForClickable({ timeout: TIMEOUTS.STANDARD_WAIT });
    await enhancerBtn.click();
    console.log("Clicked Enhancer button");

    await browser.pause(TIMEOUTS.MEDIUM_WAIT);

    console.log("Configuring Enhancer settings...");

    // Step 1: Click "Next" button at the bottom
    console.log("Step 1: Clicking Next button...");
    const nextBtn = await browser.$("//button[contains(text(), 'Next')]");
    await nextBtn.waitForClickable({ timeout: TIMEOUTS.STANDARD_WAIT });
    await nextBtn.click();
    console.log("Clicked Next button");
    await browser.pause(TIMEOUTS.MEDIUM_WAIT);

    // Step 2: Close the "Data Source for Prices" modal with X button
    console.log("Step 2: Closing Data Source for Prices modal...");

    const closeBtnSelectors = [
      ".shepherd-cancel-icon",
      "button.shepherd-cancel-icon",
      ".shepherd-header button",
      "button[aria-label='Close Tour']",
      ".shepherd-element header button",
      "//div[contains(@class, 'shepherd-header')]//button",
      "//button[contains(@class, 'shepherd-cancel-icon')]",
    ];
    const foundModal = await clickButtonWithSelectors(browser, closeBtnSelectors, "modal close button");
    if (foundModal) {
      await browser.pause(TIMEOUTS.QUICK_WAIT);
    } else {
      console.log("No modal found to close, continuing to next step...");
    }

    // Step 3: Navigate to SBC Configuration tab
    console.log("Step 3: Navigating to SBC Configuration tab...");
    const sbcConfigTab = await browser.$("//button[contains(text(), 'SBC Configuration')]");
    await sbcConfigTab.waitForClickable({ timeout: TIMEOUTS.STANDARD_WAIT });
    await sbcConfigTab.click();
    console.log("Clicked SBC Configuration tab");
    await browser.pause(TIMEOUTS.QUICK_WAIT);

    // Step 4: Toggle the untradeable
    console.log("Step 4: Toggling Untradeables Only...");
    const untradeablesToggle = await browser.$("//span[text()='Untradeables Only']/following-sibling::div[contains(@class, 'ut-toggle-control')]");
    await untradeablesToggle.waitForExist({ timeout: TIMEOUTS.LONG_WAIT });

    const toggleClasses = await untradeablesToggle.getAttribute("class");
    if (toggleClasses.includes("toggled")) {
      console.log("Untradeables Only is ON, turning it OFF...");
      await untradeablesToggle.click();
      await browser.pause(500);
      console.log("Untradeables Only disabled");
    } else {
      console.log("Untradeables Only is already OFF");
    }

    // Step 5: Save Configuration (press Enter or click Save button)
    console.log("Step 5: Saving configuration...");
    try {
      await browser.keys("Enter");
      console.log("Pressed Enter to save configuration");
      await browser.pause(TIMEOUTS.QUICK_WAIT);
    } catch (e) {
      console.log("Enter didn't work, trying Save button...");
      const saveBtnSelectors = ["//button[contains(text(), 'Save Configuration')]", "//button[contains(text(), 'Save')]", "//button[contains(text(), 'save')]"];
      const savedConfig = await clickButtonWithSelectors(browser, saveBtnSelectors, "save button");
      if (savedConfig) {
        await browser.pause(TIMEOUTS.QUICK_WAIT);
      } else {
        console.log("Could not save configuration");
      }
    }

    console.log("Settings configured successfully");

    // Start doing sbc
    console.log(`\n=== Starting SBC completion (${numOfTimes} times, type: ${type}) ===\n`);

    for (let i = 0; i < numOfTimes; i++) {
      console.log(`\n--- Iteration ${i + 1} of ${numOfTimes} ---`);
      await dismissFeedbackModal(browser);

      console.log("Navigating to SBC tab...");
      await btnClick(browser, "/html/body/main/section/nav/button[6]", TIMEOUTS.DEFAULT_CLICK);
      await browser.pause(TIMEOUTS.QUICK_WAIT);
      await dismissFeedbackModal(browser);

      console.log("Clicking favorite tab...");
      await btnClick(browser, "/html/body/main/section/section/div[2]/div/div[1]/div/button[2]");

      switch (type) {
        case "league":
          await dismissFeedbackModal(browser);
          console.log("Selecting 'Premium Mixed Leagues Upgrade' SBC...");
          await btnClick(browser, '//h1[text()="Premium Mixed Leagues Upgrade"]');

          console.log("Starting sub-SBCs...");
          console.log("1/4: Completing 'Libertadores & Sudamericana'...");
          await completeConceptSquad(browser, "Libertadores & Sudamericana");
          await browser.pause(TIMEOUTS.QUICK_WAIT);

          console.log("2/4: Completing 'Ligue 1 & Eredivisie'...");
          await completeConceptSquad(browser, "Ligue 1 & Eredivisie");
          await browser.pause(TIMEOUTS.QUICK_WAIT);

          console.log("3/4: Completing 'Bundesliga & Serie A'...");
          await completeConceptSquad(browser, "Bundesliga & Serie A");
          await browser.pause(TIMEOUTS.QUICK_WAIT);

          console.log("4/4: Completing 'Premier League & LALIGA'...");
          await completeConceptSquad(browser, "Premier League & LALIGA");

          // Only refresh if there are more iterations remaining
          if (i < numOfTimes - 1) {
            console.log("Refreshing page for next iteration...");
            await browser.refresh();
            await browser.pause(TIMEOUTS.LONG_WAIT);

            // Wait for loading screens after refresh
            console.log("Waiting for page to load after refresh...");
            await waitForLoadingShield(browser, 120000);
            console.log("Page loaded!");
            await browser.pause(TIMEOUTS.MEDIUM_WAIT);

            // Sign into Enhancer again after refresh
            await signIntoEnhancer(browser);

            // Dismiss any Feedback modal that appears after refresh
            console.log("Checking for Feedback modal after refresh...");
            await dismissFeedbackModal(browser);
            await browser.pause(TIMEOUTS.QUICK_WAIT);
          }

          console.log("Iteration complete!");
          break;
        case "upgrade":
          console.log("Completing '80+ Double Upgrade' SBC...");
          await completeConceptSquad(browser, "80+ Double Upgrade", "upgrade");
          await browser.pause(5000);
          console.log("Iteration complete!");
          break;
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    // Close the browser
    await browser.deleteSession();
  }

  const endTime = Date.now();
  const duration = endTime - startTime;
  console.log(`Total time taken: ${Math.floor(duration / 1000)} seconds`);
})();

const completeConceptSquad = async (browser, sbcName, type = "league") => {
  await dismissFeedbackModal(browser);
  console.log(`Checking challenge: ${sbcName}`);
  await safeBtnClick(browser, `//h1[text="${sbcName}"]`);

  // Check if challenge is already complete
  const completeBtn = await browser.$('//button[contains(text(), "Complete")]');
  const isComplete = (await completeBtn.isExisting()) && (await completeBtn.isDisplayed());

  if (isComplete) {
    console.log(`Challenge "${sbcName}" is already complete, skipping...`);
    return;
  }

  if (type === "league") {
    const startBtn = await browser.$('//button[text()="Start Challenge"]');
    const goToBtn = await browser.$('//button[text()="Go to Challenge"]');

    if (await startBtn.isExisting()) {
      console.log("Starting challenge...");
      await safeBtnClick(browser, '//button[text()="Start Challenge"]');
    } else if (await goToBtn.isExisting()) {
      console.log("Going to challenge...");
      await safeBtnClick(browser, '//button[text()="Go to Challenge"]');
    } else {
      console.log("No Start/Go button found, challenge might be in progress");
    }
  }

  await browser.waitUntil(async () => await browser.$(SELECTORS.GENERATE_SOLUTION_BTN).isDisplayed(), {
    timeout: TIMEOUTS.LOADING_SCREEN,
    timeoutMsg: "Expected 'Generate Solution' button to be displayed",
    interval: 1000,
  });
  await browser.keys("J");
  await setRatingInputs(browser);
  await waitForLoadingShield(browser);

  // Check if Cancel button exists (no players) or Submit button is ready (players found)
  const cancelBtn = await browser.$(SELECTORS.CANCEL_BTN);
  if ((await cancelBtn.isExisting()) && (await cancelBtn.isDisplayed())) {
    console.log("No players available in completeConceptSquad, clicking Cancel");
    await safeBtnClick(browser, SELECTORS.CANCEL_BTN, TIMEOUTS.STANDARD_WAIT * 2);
  }

  await attemptSBCSubmission(browser, sbcName, type);

  // Wait for submission to complete and any post-submission screens
  await browser.pause(TIMEOUTS.QUICK_WAIT);
  console.log("SBC submission completed");
};

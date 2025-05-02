const { remote } = require("webdriverio");
const { authenticator } = require("otplib");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const btnClick = async (browser, path, timeout = 30000) => {
  const btn = await browser.$(path);
  await btn.waitForClickable({ timeout: timeout });
  await btn.click();
};

const textFill = async (browser, path, text, timeout = 30000) => {
  const textField = await browser.$(path);
  await textField.waitForEnabled({ timeout: timeout });
  await textField.setValue(text);
};

const closeNewTab = async (browser) => {
  // Close any new tab that might have opened before starting the main script
  await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 2, {
    timeout: 5000, // Adjust the timeout as needed
    timeoutMsg: "Expected two browser tabs to be open",
    interval: 1000, // Frequency of checks
  });

  // Close the new tab and switch back to the original tab
  const handles = await browser.getWindowHandles();
  await browser.switchToWindow(handles[1]);
  await browser.closeWindow();
  await browser.switchToWindow(handles[0]);
};

// Function to wait for the loading shield to disappear
const waitForLoadingShield = async (browser, timeout = 60000) => {
  const loadingShield = await browser.$("div.ut-click-shield.showing.fsu-loading");
  if (await loadingShield.isExisting()) {
    await browser.waitUntil(async () => !(await loadingShield.isDisplayed()), {
      timeout,
      timeoutMsg: "Expected loading shield to disappear",
      interval: 1000,
    });
  }
};

// Function to handle button clicks with error handling
const safeBtnClick = async (browser, selector, timeout = 5000) => {
  try {
    await btnClick(browser, selector, timeout);
  } catch (error) {
    console.log("continue");
  }
};

// Function to handle SBC submission attempts
const attemptSBCSubmission = async (browser, sbcName, type, maxAttempts = 50, submitAttempts = 0) => {
  while (submitAttempts < maxAttempts) {
    try {
      await safeBtnClick(browser, '//button[.//span[@class="btn-text" and text()="Do not show this again"]]', 2000);
      await btnClick(browser, "/html/body/main/section/section/div[2]/div/div/div/div[3]/button[2]", 5000);
      break; // Exit loop if successful
    } catch (error) {
      submitAttempts++;
      if (submitAttempts >= maxAttempts) {
        throw new Error("Failed to submit SBC after multiple attempts");
      }
      await handleFailedSBCSubmission(browser, sbcName, type, submitAttempts);
    }
  }
};

// Function to handle failed SBC submission logic
const handleFailedSBCSubmission = async (browser, sbcName, type, attempt) => {
  await safeBtnClick(browser, '//button[.//span[@class="btn-text" and text()="Cancel"]]', 2000);
  await safeBtnClick(browser, '//button[.//span[@class="btn-text" and text()="Do not show this again"]]', 2000);
  // 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46, 49
  if (attempt % 3 === 1) {
    await safeBtnClick(browser, "/html/body/main/section/section/div[2]/div/div/section/div/section/div/div[3]/div[2]/div/div");
    const index = Math.floor((attempt - 1) / 3) + ((attempt - 1) % 3) + 2;
    await safeBtnClick(browser, `/html/body/main/section/section/div[2]/div/div/section/div/section/div/div[3]/div[2]/div/div/ul/li[${((index - 2) % 3) + 2}]`, 30000);
    await browser.keys("Backspace");
    await safeBtnClick(browser, `//h1[text()="${sbcName}"]`);
    if (type === "league") {
      await safeBtnClick(browser, '//button[text()="Go to Challenge"]');
    }
    await safeBtnClick(browser, "/html/body/main/section/section/div[2]/div/div/section/div/section/div/div[1]/button");
    await browser.pause(5000);
    await waitForLoadingShield(browser);
  } else if (attempt % 3 === 2) {
    await safeBtnClick(browser, "/html/body/main/section/section/div[2]/div/div/section/div/section/div/div[1]/button");
    await browser.pause(5000);
    await waitForLoadingShield(browser);
  } else {
    await browser.waitUntil(async () => await browser.$("button.btn-standard.primary.call-to-action.generate-btn.btn-gradient-secondary").isDisplayed(), {
      timeout: 60000,
      timeoutMsg: "Expected 'Generate Solution' button to be displayed",
      interval: 1000,
    });
    await browser.keys("J");
    const ratingInput = await browser.$("/html/body/div[4]/section/div/p[1]/div/div[1]/div[2]/div[1]/div[2]/div[2]/input");
    await ratingInput.clearValue();
    await ratingInput.setValue("82");
    await browser.pause(1000);
    await safeBtnClick(browser, "/html/body/div[4]/section/div/p[1]/div/div[12]/div[2]/div/div");
    await browser.pause(2000);
    await browser.keys("Enter");
    //await browser.pause(20000);
    await waitForLoadingShield(browser);
    await safeBtnClick(browser, '//button[.//span[@class="btn-text" and text()="Cancel"]]', 20000);
  }
};

(async () => {
  var args = process.argv.slice(2);
  const numOfTimes = args[0] ? parseInt(args[0]) : 1;
  const type = args[1] ? args[1] : "league";

  // Set up WebDriverIO configuration
  const browser = await remote({
    capabilities: {
      browserName: "chrome",
      "goog:chromeOptions": {
        extensions: [fs.readFileSync(path.resolve("./FC25-Enhancer-SBC-Solver-Trader-Keyboard-Shortcuts-Chrome-Web-Store.crx")).toString("base64"), fs.readFileSync(path.resolve("./Tampermonkey-Chrome-Web-Store.crx")).toString("base64")],
        args: ["--window-size=1300,1400"],
      },
    },
  });

  await closeNewTab(browser);

  await browser.url("chrome://extensions/");
  await browser.execute(() => {
    const extensionsManager = document.querySelector("body > extensions-manager").shadowRoot;
    const toolbar = extensionsManager.querySelector("#toolbar").shadowRoot;
    const devModeButton = toolbar.querySelector("#devMode");
    devModeButton.click();
  });
  await browser.execute(() => {
    const extensionsManager = document.querySelector("body > extensions-manager").shadowRoot;
    const toolbar = extensionsManager.querySelector("#toolbar").shadowRoot;
    const updateNowButton = toolbar.querySelector("#updateNow");
    updateNowButton.click();
  });

  await closeNewTab(browser);

  let attempts = 0;
  const maxAttempts = 100;
  while (attempts < maxAttempts) {
    try {
      await browser.url("chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/options.html#nav=new-user-script+editor");
      const scriptContent = fs.readFileSync(path.resolve("./fsu.js"), "utf-8");
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

  // Perform login actions
  await btnClick(browser, '//*[@id="Login"]/div/div/button[1]');
  await textFill(browser, '//*[@id="email"]', process.env.MAINEMAIL);
  await btnClick(browser, '//*[@id="logInBtn"]');
  await textFill(browser, '//*[@id="password"]', process.env.MAINPASSWORD);
  await btnClick(browser, '//*[@id="logInBtn"]');
  await btnClick(browser, '//*[@id="APPLabel"]');
  await btnClick(browser, '//*[@id="btnSendCode"]');
  const token = authenticator.generate(process.env.GTOP);
  await textFill(browser, '//*[@id="twoFactorCode"]', token);
  await btnClick(browser, '//*[@id="btnSubmit"]');

  await browser.pause(25000);

  //开干
  try {
    // enhancer signin btn
    await btnClick(browser, "/html/body/main/section/section/div[1]/div[2]/button");
    await textFill(browser, "/html/body/div[4]/section/div/p[1]/div/div[1]/input", process.env.ENHANCERUSR);
    await textFill(browser, "/html/body/div[4]/section/div/p[1]/div/div[2]/input", process.env.ENHANCERPWD);
    await browser.pause(1000);
    await btnClick(browser, "/html/body/div[4]/section/div/p[1]/div/div[4]/button");

    // disable untradeable only
    await btnClick(browser, "/html/body/main/section/nav/button[11]");
    await btnClick(browser, "/html/body/div[7]/div[2]/footer/button");
    await btnClick(browser, "/html/body/div[8]/div[2]/header/button/span");
    await btnClick(browser, "/html/body/main/section/section/div[2]/div/div/div[2]/div[1]/button[4]");
    await browser.pause(1000);
    await btnClick(browser, "/html/body/main/section/section/div[2]/div/div/div[2]/div[2]/div[2]/div[4]/div/div/div[2]");
    await browser.pause(1000);
    await btnClick(browser, "/html/body/main/section/section/div[2]/div/div/div[3]/button");

    // Start doing sbc
    for (let i = 0; i < numOfTimes; i++) {
      await safeBtnClick(browser, '//button[.//span[@class="btn-text" and text()="Do not show this again"]]', 2000);
      // sbc tab
      await btnClick(browser, "/html/body/main/section/nav/button[6]", 30000);
      // favorite tab
      await btnClick(browser, "/html/body/main/section/section/div[2]/div/div[1]/div/button[2]");

      switch (type) {
        case "league":
          // premium league sbc
          await btnClick(browser, '//h1[text()="Premium Mixed Leagues Upgrade"]');
          // start the sub sbcs
          await completeConceptSquad(browser, "Ligue 1 & Eredivisie");
          await browser.pause(5000);
          await completeConceptSquad(browser, "Libertadores & Sudamericana");
          await browser.pause(5000);
          await completeConceptSquad(browser, "Bundesliga & Serie A");
          await browser.pause(5000);
          await completeConceptSquad(browser, "Premier League & LALIGA");

          await browser.refresh();
          await browser.pause(15000);
          break;
        case "upgrade":
          await completeConceptSquad(browser, "80+ Double Upgrade", "upgrade");
          await browser.pause(5000);
          break;
      }
    }

    await browser.refresh();
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    // Close the browser
    await browser.deleteSession();
  }
})();

const completeConceptSquad = async (browser, sbcName, type = "league") => {
  await safeBtnClick(browser, `//h1[text()="${sbcName}"]`);
  if (type === "league") {
    if (await browser.$('//button[text()="Start Challenge"]').isExisting()) {
      await safeBtnClick(browser, '//button[text()="Start Challenge"]');
    } else {
      await safeBtnClick(browser, '//button[text()="Go to Challenge"]');
    }
  }

  await safeBtnClick(browser, '//button[.//span[@class="btn-text" and text()="Do not show this again"]]', 2000);

  await browser.waitUntil(async () => await browser.$("button.btn-standard.primary.call-to-action.generate-btn.btn-gradient-secondary").isDisplayed(), {
    timeout: 60000,
    timeoutMsg: "Expected 'Generate Solution' button to be displayed",
    interval: 1000,
  });
  await browser.keys("J");

  const ratingInput = await browser.$("/html/body/div[4]/section/div/p[1]/div/div[1]/div[2]/div[1]/div[2]/div[2]/input");
  await ratingInput.clearValue();
  await ratingInput.setValue("82");
  await browser.pause(1000);
  await safeBtnClick(browser, "/html/body/div[4]/section/div/p[1]/div/div[12]/div[2]/div/div");
  await browser.pause(2000);
  await browser.keys("Enter");
  //await browser.pause(20000);
  await waitForLoadingShield(browser);
  await safeBtnClick(browser, '//button[.//span[@class="btn-text" and text()="Cancel"]]', 20000);
  await attemptSBCSubmission(browser, sbcName, type);
  await safeBtnClick(browser, '//button[.//span[text()="Continue"]]', 5000);
  await browser.pause(2000);
};

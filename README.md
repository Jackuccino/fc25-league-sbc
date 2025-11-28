# FC25 League SBC Automation

Automated script for completing FC25 Squad Building Challenges (SBCs) using WebDriverIO and Chrome automation.

## Features

- ✅ Automatic EA account login with 2FA support
- ✅ FC Enhancer integration and configuration
- ✅ Automated SBC completion for Premium Mixed Leagues Upgrade
- ✅ Modal handling (Feedback, Priceless player tips)
- ✅ Smart recovery flow with autofill fallback
- ✅ Support for multiple iterations

## Prerequisites

- **Node.js** (v14 or higher)
- **Chrome Browser** (v136 or compatible)
- **FC Enhancer Extension** (included as `.crx` file)
- **Tampermonkey Extension** (included as `.crx` file)

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/Jackuccino/fc25-league-sbc.git
cd fc25-league-sbc
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# EA Account Credentials
MAINEMAIL=your_ea_email@example.com
MAINPASSWORD=your_ea_password

# 2FA Secret (from your authenticator app)
MAIN2FA=your_2fa_secret_key

# FC Enhancer Credentials (optional, defaults to EA account)
ENHANCERUSR=your_enhancer_email@example.com
ENHANCERPWD=your_enhancer_password
```

**Note:** To get your 2FA secret key, you'll need to set up 2FA on your EA account and save the secret key when configuring your authenticator app.

### 4. Extension Files

Make sure the following extension files are present in the project directory:

- `FC26-Enhancer-SBC-Solver-Trader-Keyboard-Shortcuts-Chrome-Web-Store.crx`
- `Tampermonkey-Chrome-Web-Store.crx`

## Usage

Run the script with the following command:

```bash
node main.js [numOfTimes] [type]
```

### Parameters

- **numOfTimes** (optional): Number of times to complete the SBC (default: 1)
- **type** (optional): SBC type - `league` or `upgrade` (default: `league`)

### Examples

```bash
# Complete the SBC once
node main.js

# Complete the SBC 5 times
node main.js 5

# Complete the upgrade SBC 3 times
node main.js 3 upgrade
```

## How It Works

1. **Login**: Automatically logs into your EA account with 2FA
2. **Enhancer Setup**: Signs into FC Enhancer and configures settings (disables Untradeables Only)
3. **SBC Navigation**: Navigates to the SBC tab and selects the target SBC
4. **Challenge Completion**: For each sub-challenge:
   - Opens the challenge
   - Uses rating input method (J key) to filter players
   - Sets min/max ratings (10-82)
   - Submits the squad
   - Handles any modals that appear
5. **Recovery**: If submission fails, attempts autofill method
6. **Iteration**: Refreshes and repeats for multiple iterations

## SBC Types

### League SBC (Default)

Completes "Premium Mixed Leagues Upgrade" with 4 sub-challenges:

1. Libertadores & Sudamericana
2. Ligue 1 & Eredivisie
3. Bundesliga & Serie A
4. Premier League & LALIGA

### Upgrade SBC

Completes "80+ Double Upgrade" SBC

## Troubleshooting

### Chrome Driver Issues

If you encounter ChromeDriver version mismatches:

```bash
npm install chromedriver@latest --save-dev
```

### Extensions Not Loading

Ensure the `.crx` files are in the correct location and have not been corrupted.

### 2FA Not Working

- Verify your 2FA secret key is correct
- Check that your system time is synchronized

### Script Hangs or Freezes

- Check for unexpected modals blocking the workflow
- Verify internet connection is stable
- Review console output for error messages

## Configuration

### Timeouts

All timeout values are centralized in the `TIMEOUTS` constant:

```javascript
TIMEOUTS = {
  DEFAULT_CLICK: 30000, // 30 seconds
  QUICK_WAIT: 1000, // 1 second
  MEDIUM_WAIT: 2000, // 2 seconds
  LONG_WAIT: 5000, // 5 seconds
  STANDARD_WAIT: 10000, // 10 seconds
  LOADING_SCREEN: 60000, // 60 seconds
  EXTENDED_LOADING: 120000, // 120 seconds
};
```

### Rating Inputs

Default rating filter: **10 (min) - 82 (max)**

Modify in the `setRatingInputs` function to adjust player selection criteria.

## License

ISC

## Disclaimer

This script is for educational purposes only. Use at your own risk. Automated interactions with EA services may violate their Terms of Service.

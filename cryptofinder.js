// Import necessary modules for GNOME Shell
import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Function to make HTTP requests using Soup (GNOME's HTTP client)
function httpRequest(url) {
  return new Promise((resolve, reject) => {
    try {
      const session = new Soup.Session();
      const message = Soup.Message.new('GET', url);
      
      if (!message) {
        reject(new Error(`Failed to create message for URL: ${url}`));
        return;
      }
      
      // Make the request asynchronously
      session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, result) => {
          try {
            const bytes = session.send_and_read_finish(result);
            if (!bytes) {
              reject(new Error('No data received from request'));
              return;
            }
            
            if (message.get_status() !== Soup.Status.OK) {
              reject(new Error(`HTTP error: ${message.get_status()}`));
              return;
            }
            
            const decoder = new TextDecoder('utf-8');
            const data = decoder.decode(bytes.get_data());
            try {
              resolve(JSON.parse(data));
            } catch (parseError) {
              reject(new Error(`JSON parse error: ${parseError.message}`));
            }
          } catch (error) {
            reject(error);
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

// Find the path to our extension directory
function getExtensionPath() {
  // Try to find the extension directory
  const extensionDir = Gio.File.new_for_path(GLib.build_filenamev([
    GLib.get_home_dir(), 
    '.local', 
    'share', 
    'gnome-shell', 
    'extensions', 
    'cryptotracker@bilgi.works'
  ]));
  
  // Verify the directory exists
  if (!extensionDir.query_exists(null)) {
    console.error('Extension directory not found');
    return null;
  }
  
  return extensionDir.get_path();
}

// Read the JSON file
export async function getCryptoBalance(settings = null) {
  try {
    // Get extension path
    const extensionPath = getExtensionPath();
    if (!extensionPath) {
      throw new Error('Extension directory not found');
    }
    
    // Read the JSON file using GLib/Gio
    const jsonPath = GLib.build_filenamev([extensionPath, 'crypto-track.json']);
    const file = Gio.File.new_for_path(jsonPath);
    
    let jsonData;
    
    if (file.query_exists(null)) {
      // Try to read from file first
      const [success, contents] = file.load_contents(null);
      
      if (success) {
        const decoder = new TextDecoder('utf-8');
        jsonData = JSON.parse(decoder.decode(contents));
      } else if (settings) {
        // Try to use settings backup if file read failed
        const backupJson = settings.get_string('crypto-json');
        if (backupJson && backupJson.length > 0) {
          jsonData = JSON.parse(backupJson);
          console.log('Using backup JSON from settings');
        } else {
          throw new Error('Failed to read crypto-track.json and no backup available');
        }
      } else {
        throw new Error('Failed to read crypto-track.json');
      }
    } else if (settings) {
      // Try to use settings backup if file doesn't exist
      const backupJson = settings.get_string('crypto-json');
      if (backupJson && backupJson.length > 0) {
        jsonData = JSON.parse(backupJson);
        console.log('Using backup JSON from settings (file not found)');
        
        // Create the file with backup data
        try {
          file.replace_contents(
            backupJson,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
          );
          console.log('Created crypto-track.json from backup data');
        } catch (error) {
          console.error('Error creating file from backup:', error);
        }
      } else {
        throw new Error('Configuration empty. Visit Preferences to set up');
      }
    } else {
      throw new Error('Configuration empty. Visit Preferences to set up');
    }

    if (!jsonData || !Array.isArray(jsonData) || jsonData.length < 2) {
      throw new Error('Configuration incomplete. Visit Preferences to set up properly');
    }
    
    const CURRENCY = jsonData[0].CURRENCY;
    const SYMBOLS = jsonData[0].SYMBOLS;
    
    if (!CURRENCY || !SYMBOLS) {
      throw new Error('Missing currency information. Visit Preferences to configure');
    }
    
    let totalBalance = 0;
    let successfulWallets = 0;

    // Process each wallet
    for (const item of jsonData.slice(1)) {
      if (!item.WALLET_ADDRESS || !item.SHORTNAME || !item.FULLNAME) {
        console.warn('Skipping wallet with missing information:', item);
        continue;
      }
      
      const WALLET_ADDRESS = item.WALLET_ADDRESS;
      const SHORTNAME = item.SHORTNAME;
      const FULLNAME = item.FULLNAME;
      const blockcypherUrl = `https://api.blockcypher.com/v1/${SHORTNAME}/main/addrs/${WALLET_ADDRESS}/balance`;
      const coingeckoUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${FULLNAME}&vs_currencies=${CURRENCY}`;

      try {
        const walletRequest = await httpRequest(blockcypherUrl);
        if (!walletRequest || typeof walletRequest.balance !== 'number') {
          console.warn(`Invalid wallet data for ${SHORTNAME}`);
          continue;
        }
        
        const walletBalance = walletRequest.balance / 1e8;

        const priceRequest = await httpRequest(coingeckoUrl);
        if (!priceRequest || !priceRequest[FULLNAME] || typeof priceRequest[FULLNAME][CURRENCY] !== 'number') {
          console.warn(`Invalid price data for ${FULLNAME}`);
          continue;
        }
        
        const price = priceRequest[FULLNAME][CURRENCY];

        const balance = walletBalance * price;
        totalBalance += balance;
        successfulWallets++;
      } catch (error) {
        console.error(`Error processing wallet ${SHORTNAME}:`, error);
        // Continue with other wallets
      }
    }

    if (successfulWallets === 0 && jsonData.length > 1) {
      return {
        symbol: SYMBOLS,
        balance: 0,
        formattedBalance: 'Unable to retrieve wallet data'
      };
    }

    return {
      symbol: SYMBOLS,
      balance: totalBalance,
      formattedBalance: `${SYMBOLS} ${totalBalance.toFixed(2)}`
    };
  } catch (error) {
    console.error('Error in getCryptoBalance:', error);
    return {
      balance: 0,
      formattedBalance: 'Check preferences > Cryptocurrency'
    };
  }
} 
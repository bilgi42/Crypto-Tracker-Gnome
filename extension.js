/* ===== IMPORTS SECTION =====
 * This section imports all the necessary libraries and components needed for the extension
 */

// For settings, import Gio
import Gio from 'gi://Gio';
// GObject: The GLib Object System - provides object-oriented framework
import GObject from 'gi://GObject';
// St: Shell Toolkit - GNOME Shell's UI toolkit, provides UI elements
import St from 'gi://St';
import GLib from 'gi://GLib';
// Import Clutter for alignment constants
import Clutter from 'gi://Clutter';

// Import the ES module for cryptocurrency data
import { getCryptoBalance } from './cryptofinder.js';

// Core GNOME Shell extension functionality and translation support
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
// PanelMenu: For creating panel menu buttons in the top bar
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
// PopupMenu: For creating dropdown menus
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Main provides access to the GNOME Shell's main UI and functionality
// including the notification system
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/* ===== UI COMPONENT DEFINITION =====
 * Here we define the UI component that will appear in the GNOME panel (top bar)
 */
// Define and register the Indicator class
// GObject.registerClass is a decorator that registers this class with the GObject type system
// This is necessary for integration with GNOME Shell's UI system
const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        // Constructor method - called when the indicator is created
        _init() {
            // Initialize the parent class (PanelMenu.Button)
            // 0.0 is the menu alignment (0.0 = left, 1.0 = right)
            // The second parameter is the accessible name for screen readers
            super._init(0.0, _('Crypto Balance Indicator'));

            // Create a box layout for the panel button
            this._box = new St.BoxLayout({
                vertical: false,
                style_class: 'panel-status-menu-box',
            });
            
            
            
            // Create a label to display the balance
            this._balanceLabel = new St.Label({
                text: _('Loading...'),
                y_align: Clutter.ActorAlign.CENTER, // Fix: Use Clutter.ActorAlign instead of St.Align
            });
            
            // Add elements to the box
            this._box.add_child(this._balanceLabel);
            
            // Add the box to the panel button
            this.add_child(this._box);
            
            // Load initial balance
            this._updateBalance();
            
            // Create refresh menu item
            let refreshItem = new PopupMenu.PopupMenuItem(_('Refresh Balance'));
            refreshItem.connect('activate', () => {
                this._updateBalance();
            });
            this.menu.addMenuItem(refreshItem);
            
            // Add separator
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Create notification item
            let notifyItem = new PopupMenu.PopupMenuItem(_('Show Balance Notification'));
            notifyItem.connect('activate', () => {
                if (this._lastBalance) {
                    Main.notify(_('Crypto Balance'), this._lastBalance);
                } else {
                    Main.notify(_('Crypto Balance'), _('Balance not available yet'));
                }
            });
            this.menu.addMenuItem(notifyItem);
            
            // Add preferences menu item
            this._prefsItem = new PopupMenu.PopupMenuItem(_('Preferences'));
            this.menu.addMenuItem(this._prefsItem);
        }
        
        async _updateBalance() {
            try {
                this._balanceLabel.set_text(_('Updating...'));
                const result = await getCryptoBalance(this._settings);
                this._lastBalance = result.formattedBalance;
                this._balanceLabel.set_text(result.formattedBalance);
                
                // Check if result contains a configuration error message
                if (result.balance === 0 && result.formattedBalance.includes('Visit Preferences')) {
                    // Highlight the preferences menu item
                    if (this._prefsItem) {
                        const icon = new St.Icon({
                            icon_name: 'dialog-warning-symbolic',
                            style_class: 'popup-menu-icon',
                        });
                        this._prefsItem.add_child(icon);
                        this._prefsItem.label.set_text(_('Configure Extension'));
                    }
                }
            } catch (error) {
                console.error('Failed to get balance:', error);
                this._balanceLabel.set_text(_('Error'));
            }
        }
    });

/* ===== MAIN EXTENSION CLASS =====
 * This is the main class that GNOME Shell interacts with
 * It handles the lifecycle of the extension (enable/disable)
 */
// The main extension class that GNOME Shell interacts with
// Must extend the Extension class and implement enable() and disable() methods
export default class IndicatorExampleExtension extends Extension {
    // Called when the extension is enabled (activated by the user or at startup)
    enable() {
        // Create an instance of our custom Indicator
        this._indicator = new Indicator();
        
        // Create a new GSettings object
        this._settings = this.getSettings();
        
        // Store settings in indicator
        this._indicator._settings = this._settings;

        // Add the indicator to the status area of the top panel
        // this.uuid ensures a unique identifier for this extension's UI elements
        // (uuid comes from metadata.json)
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // Set up refresh interval (every 5 minutes)
        this._refreshTimeout = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            300, // 300 seconds = 5 minutes
            () => {
                this._indicator._updateBalance();
                return GLib.SOURCE_CONTINUE; // Keep the source
            }
        );

        // Add a menu item to open the preferences window
        this._indicator._prefsItem.connect('activate', () => this.openPreferences());

        /* ===== SETTINGS HANDLING =====
         * This section sets up the connection to the extension's settings
         */
        // Instead of binding, directly set the property based on the setting
        const showIndicator = this._settings.get_boolean('show-indicator');
        this._indicator.visible = showIndicator;
        
        // Watch for changes to update the property
        this._settings.connect('changed::show-indicator', (settings) => {
            const newValue = settings.get_boolean('show-indicator');
            this._indicator.visible = newValue;
        });
    }

    /* ===== CLEANUP =====
     * This method is called when the extension is disabled
     * It should clean up any resources to prevent memory leaks
     */
    // Called when the extension is disabled (deactivated by the user or during shutdown)
    disable() {
        // Remove the refresh timeout
        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = null;
        }
        
        // Clean up by destroying the indicator
        this._indicator?.destroy();

        // Clear the reference to avoid memory leaks
        this._indicator = null;
        this._settings = null;
    }
}

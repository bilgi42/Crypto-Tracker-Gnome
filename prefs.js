/* ===== IMPORTS SECTION =====
 * Libraries needed for the preferences UI
 */
import Gio from 'gi://Gio';  // For GSettings binding and general I/O operations
import Adw from 'gi://Adw';  // Libadwaita - Modern GTK UI toolkit for GNOME
import Gtk from 'gi://Gtk';  // GTK for UI components
import GLib from 'gi://GLib'; // For file operations
import GObject from 'gi://GObject'; // For object-oriented programming

// Import preferences extension base class and translation function
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/* ===== PREFERENCES CLASS =====
 * This class defines the UI for the extension settings
 */
export default class CryptoTrackerPreferences extends ExtensionPreferences {
    // This method is called when the preferences window is created
    fillPreferencesWindow(window) {
        // Get extension path
        this._extensionPath = this.path;
        this._cryptoTrackPath = GLib.build_filenamev([this._extensionPath, 'crypto-track.json']);
        
        // Create settings object
        window._settings = this.getSettings();
        
        // Create a preferences page for general settings
        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(generalPage);
        
        // Create a preferences group for appearance settings
        const appearanceGroup = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Configure the appearance of the extension'),
        });
        generalPage.add(appearanceGroup);

        // Create a switch row for show indicator setting
        const showIndicatorRow = new Adw.SwitchRow({
            title: _('Show Indicator'),
            subtitle: _('Whether to show the panel indicator'),
        });
        appearanceGroup.add(showIndicatorRow);
        
        // Bind the setting to the switch
        window._settings.bind(
            'show-indicator',
            showIndicatorRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        // Create a preferences page for cryptocurrency configuration
        const cryptoPage = new Adw.PreferencesPage({
            title: _('Cryptocurrency')
        });
        window.add(cryptoPage);
        
        // Create a preferences group for JSON editor
        const jsonGroup = new Adw.PreferencesGroup({
            title: _('Configuration'),
            description: _('Edit cryptocurrency tracking configuration'),
        });
        cryptoPage.add(jsonGroup);
        
        // Create a text view for editing JSON
        const scrolledWindow = new Gtk.ScrolledWindow({
            hexpand: true,
            vexpand: true,
            min_content_height: 300,
        });
        
        const textView = new Gtk.TextView({
            wrap_mode: Gtk.WrapMode.WORD,
            monospace: true,
        });
        
        const textBuffer = textView.get_buffer();
        scrolledWindow.set_child(textView);
        
        // Add the scrolled window to a Gtk.Box with padding
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 10,
            margin_end: 10,
            hexpand: true,
            vexpand: true,
        });
        
        // Create a link box with message for empty JSON
        const linkBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 10,
            margin_bottom: 10,
            hexpand: true,
            visible: false, // Hidden by default
        });
        
        const messageLabel = new Gtk.Label({
            label: _('Your crypto-track.json (The cryptocurrency config) is empty or invalid. You can generate a new one at:'),
            wrap: true,
            xalign: 0,
        });
        
        const linkButton = new Gtk.LinkButton({
            uri: 'https://bilgi42.github.io/polybar-crypto-track/',
            label: 'https://bilgi42.github.io/polybar-crypto-track/',
            margin_top: 5,
            margin_bottom: 10,
        });
        
        linkBox.append(messageLabel);
        linkBox.append(linkButton);
        box.append(linkBox);
        
        box.append(scrolledWindow);
        
        // Add buttons for actions
        const buttonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            halign: Gtk.Align.END,
            margin_top: 10,
        });
        
        const reloadButton = new Gtk.Button({
            label: _('Reload from File'),
            tooltip_text: _('Reload JSON from crypto-track.json file'),
        });
        
        const saveButton = new Gtk.Button({
            label: _('Save'),
            tooltip_text: _('Save changes to crypto-track.json file'),
            css_classes: ['suggested-action'],
        });
        
        buttonBox.append(reloadButton);
        buttonBox.append(saveButton);
        box.append(buttonBox);
        
        // Add the box to the group
        jsonGroup.add(box);
        
        // Load JSON content
        this._loadJsonContent(textBuffer, linkBox);
        
        // Connect signals
        reloadButton.connect('clicked', () => {
            this._loadJsonContent(textBuffer, linkBox);
        });
        
        saveButton.connect('clicked', () => {
            this._saveJsonContent(textBuffer, linkBox);
        });
    }
    
    // Load JSON content from file
    _loadJsonContent(textBuffer, linkBox) {
        try {
            const file = Gio.File.new_for_path(this._cryptoTrackPath);
            
            if (!file.query_exists(null)) {
                // File doesn't exist, show the link box
                linkBox.visible = true;
                textBuffer.set_text(JSON.stringify([], null, 4), -1);
                return;
            }
            
            const [success, contents] = file.load_contents(null);
            
            if (!success) {
                throw new Error('Failed to read crypto-track.json');
            }
            
            const decoder = new TextDecoder('utf-8');
            const jsonContent = decoder.decode(contents);
            
            // Try to parse and format JSON
            const jsonData = JSON.parse(jsonContent);
            
            // Check if the JSON is empty or has minimal content (less than 2 entries)
            if (!jsonData || !Array.isArray(jsonData) || jsonData.length < 2) {
                linkBox.visible = true;
            } else {
                linkBox.visible = false;
            }
            
            const prettyJson = JSON.stringify(jsonData, null, 4);
            
            // Set text buffer content
            textBuffer.set_text(prettyJson, prettyJson.length);
        } catch (error) {
            console.error('Error loading JSON:', error);
            linkBox.visible = true;
            textBuffer.set_text(JSON.stringify([], null, 4), -1);
        }
    }
    
    // Save JSON content to file
    _saveJsonContent(textBuffer, linkBox) {
        try {
            const [start, end] = textBuffer.get_bounds();
            const text = textBuffer.get_text(start, end, true);
            
            // Validate JSON
            const parsedJson = JSON.parse(text);
            const jsonContent = JSON.stringify(parsedJson, null, 4);
            
            // Check if the JSON is empty or minimal
            if (!parsedJson || !Array.isArray(parsedJson) || parsedJson.length < 2) {
                linkBox.visible = true;
            } else {
                linkBox.visible = false;
            }
            
            // Save to file
            const file = Gio.File.new_for_path(this._cryptoTrackPath);
            file.replace_contents(
                jsonContent,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
            
            // Also store in settings for backup/reference
            this.getSettings().set_string('crypto-json', jsonContent);
        } catch (error) {
            console.error('Error saving JSON:', error);
            linkBox.visible = true;
            
            // Show error dialog
            const dialog = new Gtk.MessageDialog({
                text: _('Error saving JSON configuration'),
                secondary_text: error.message,
                message_type: Gtk.MessageType.ERROR,
                buttons: Gtk.ButtonsType.OK,
                modal: true,
            });
            
            dialog.connect('response', () => {
                dialog.destroy();
            });
            
            dialog.show();
        }
    }
}
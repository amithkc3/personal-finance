import { App, Editor, MarkdownView, Modal, Notice, Plugin, Keymap, BasesView, parsePropertyId } from 'obsidian';
import { DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab } from "./settings";

// Remember to rename these classes and interfaces!

export const ExampleViewType = 'example-view';

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// Tell Obsidian about the new view type that this plugin provides.
		// @ts-ignore
		this.registerBasesView(ExampleViewType, {
			name: 'Example',
			icon: 'lucide-graduation-cap',
			factory: (controller: any, containerEl: HTMLElement) => {
				return new MyBasesView(controller, containerEl) as any
			},
			options: () => ([
				{
					// The type of option. 'text' is a text input.
					type: 'text',
					// The name displayed in the settings menu.
					displayName: 'Property separator',
					// The value saved to the view settings.
					key: 'separator',
					// The default value for this option.
					default: ' - ',
				},
			]),
		});

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('dice', 'Sample', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status bar text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-modal-simple',
			name: 'Open modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'replace-selected',
			name: 'Replace selected content',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				editor.replaceSelection('Sample editor command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-modal-complex',
			name: 'Open modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
				return false;
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	new Notice("Click");
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MyPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// @ts-ignore
// declare const parsePropertyId: any;

// @ts-ignore
export class MyBasesView extends BasesView {
	readonly type = ExampleViewType;
	private containerEl: HTMLElement;
	// @ts-ignore
	public app: App;
	public config: any;
	public data: any;


	constructor(controller: any, parentEl: HTMLElement) {
		super(controller);
		this.containerEl = parentEl.createDiv('bases-example-view-container');
	}

	public onDataUpdated(): void {
		const { app } = this;

		// Retrieve the user configured order set in the Properties menu.
		const order = this.config.getOrder()

		// Clear entries created by previous iterations. Remember, you should
		// instead attempt element reuse when possible.
		this.containerEl.empty();

		// The property separator configured by the ViewOptions above can be
		// retrieved from the view config. Be sure to set a default value.
		const propertySeparator = String(this.config.get('separator')) || ' - ';

		// this.data contains both grouped and ungrouped versions of the data.
		// If it's appropriate for your view type, use the grouped form.
		for (const group of this.data.groupedData) {
			const groupEl = this.containerEl.createDiv('bases-list-group');
			const groupListEl = groupEl.createEl('ul', 'bases-list-group-list');

			// Each entry in the group is a separate file in the vault matching
			// the Base filters. For list view, each entry is a separate line.
			for (const entry of group.entries) {
				groupListEl.createEl('li', 'bases-list-entry', (el) => {
					let firstProp = true;
					for (const propertyName of order) {
						// Properties in the order can be parsed to determine what type
						// they are: formula, note, or file.
						// @ts-ignore
						const { type, name } = parsePropertyId(propertyName);

						// `entry.getValue` returns the evaluated result of the property
						// in the context of this entry.
						const value = entry.getValue(propertyName);

						// Skip rendering properties which have an empty value.
						// The list items for each file may have differing length.
						if (!value) continue;

						if (!firstProp) {
							el.createSpan({
								cls: 'bases-list-separator',
								text: propertySeparator
							});
						}
						firstProp = false;

						// If the `file.name` property is included in the order, render
						// it specially so that it links to that file.
						if (name === 'name' && type === 'file') {
							const fileName = String(entry.file.name);
							const linkEl = el.createEl('a', { text: fileName });
							linkEl.onClickEvent((evt) => {
								if (evt.button !== 0 && evt.button !== 1) return;
								evt.preventDefault();
								const path = entry.file.path;
								// @ts-ignore
								const modEvent = Keymap.isModEvent(evt);
								void app.workspace.openLinkText(path, '', modEvent);
							});

							linkEl.addEventListener('mouseover', (evt) => {
								app.workspace.trigger('hover-link', {
									event: evt,
									source: 'bases',
									hoverParent: this,
									targetEl: linkEl,
									linktext: entry.file.path,
								});
							});
						}
						// For all other properties, just display the value as text.
						// In your view you may also choose to use the `Value.renderTo`
						// API to better support photos, links, icons, etc.
						else {
							el.createSpan({
								cls: 'bases-list-entry-property',
								text: value.toString()
							});
						}
					}
				});
			}
		}
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	// onOpen() {
	// 	let { contentEl } = this;
	// 	contentEl.setText('Woah!');
	// }

	// onClose() {
	// 	const { contentEl } = this;
	// 	contentEl.empty();
	// }
}

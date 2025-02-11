import {
	App,
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	FuzzySuggestModal,
} from "obsidian";

enum importListTypes {
	Disabled = "DISABLE",
	OrderedList = "ORDERED",
	UnorderedList = "UNORDERED",
	CheckBox = "CHECKBOX",
}

enum orderedListDelimeters {
	Parenthesis = ")",
	Period = ".",
}

enum itemTypes {
	Link = "LINK",
	Tag = "TAG",
	Alias = "ALIAS",
}

interface AutoMOCSettings {
	//general
	showRibbonButton: boolean;
	linkToHeading: boolean;
	linkWithAlias: boolean;
	importAsList: string;
	orderedListSeparator: string;
	ignoredFolders: string;

	//notifications
	linkingMentionsNotice: boolean;
	noNewLinksNotice: boolean;
	newLinksAddedNotice: boolean;
}

const DEFAULT_SETTINGS: AutoMOCSettings = {
	//general
	showRibbonButton: true,
	linkToHeading: false,
	linkWithAlias: true,
	importAsList: importListTypes.Disabled,
	orderedListSeparator: orderedListDelimeters.Period,
	ignoredFolders: "",

	//notifications
	linkingMentionsNotice: true,
	noNewLinksNotice: true,
	newLinksAddedNotice: false,
};

export class TagSuggestModal extends FuzzySuggestModal<string> {
	selection: string;
	plugin: AutoMOC;

	constructor(app: App, plugin: AutoMOC) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.setPlaceholder("Import notes with tags matching...");
		this.setInstructions([
			{ command: "↑↓", purpose: "to navigate" },
			{ command: "↵", purpose: "to select tag" },
			{ command: "esc", purpose: "to dismiss" },
		]);

		this.inputEl.focus();
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}

	getItems(): string[] {
		const allFiles = this.app.metadataCache.resolvedLinks;
		let tagsSet = new Set<string>();

		Object.keys(allFiles).forEach((key) => {
			const file = this.app.vault.getAbstractFileByPath(key);
			if (file instanceof TFile) {
				const body_tags = app.metadataCache.getFileCache(file).tags;
				const frontmatter =
					this.app.metadataCache.getFileCache(file).frontmatter;

				if (body_tags) {
					for (const tag of body_tags) {
						tagsSet.add(tag["tag"]);
					}
				}

				let f_tags: Array<string> = [];
				if (frontmatter) {
					if (Array.isArray(frontmatter["tags"])) {
						f_tags = frontmatter["tags"];

						for (const f_tag of f_tags) {
							tagsSet.add("#" + f_tag);
						}
					}
					if (String.isString(frontmatter["tags"])) {
						f_tags = frontmatter["tags"].split(", ");

						for (const f_tag of f_tags) {
							tagsSet.add("#" + f_tag);
						}
					}
				}
			}
		});

		return Array.from(tagsSet).sort();
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
		this.selection = item;
		this.plugin.runAutoMOC(itemTypes.Tag, item);
	}
}

export class AliasSuggestModal extends FuzzySuggestModal<string> {
	selection: string;
	plugin: AutoMOC;

	constructor(app: App, plugin: AutoMOC) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.setPlaceholder("Import notes with alias matching...");
		this.setInstructions([
			{ command: "↑↓", purpose: "to navigate" },
			{ command: "↵", purpose: "to select tag" },
			{ command: "esc", purpose: "to dismiss" },
		]);

		this.inputEl.focus();
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}

	getItems(): string[] {
		const allFiles = this.app.metadataCache.resolvedLinks;
		let aliasSet = new Set<string>();

		Object.keys(allFiles).forEach((key) => {
			const file = this.app.vault.getAbstractFileByPath(key);
			if (file instanceof TFile) {
				const frontmatter =
					this.app.metadataCache.getFileCache(file).frontmatter;

				let aliases: Array<string> = [];
				if (frontmatter) {
					if (Array.isArray(frontmatter["aliases"])) {
						aliases = frontmatter["aliases"];

						for (const alias of aliases) {
							aliasSet.add(alias);
						}
					}
					if (String.isString(frontmatter["aliases"])) {
						aliases = frontmatter["aliases"].split(", ");

						for (const alias of aliases) {
							aliasSet.add(alias);
						}
					}
				}
			}
		});

		return Array.from(aliasSet).sort();
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
		this.selection = item;
		this.plugin.runAutoMOC(itemTypes.Alias, item);
	}
}

export default class AutoMOC extends Plugin {
	settings: AutoMOCSettings;

	getPresentLinks(currFilePath: string) {
		const allFiles = this.app.metadataCache.resolvedLinks;
		const presentLinks = Object.keys(allFiles[currFilePath]);

		return presentLinks.sort();
	}

	getLinkedMentions(currFilePath: string) {
		const allFiles = this.app.metadataCache.resolvedLinks;
		let linkedMentions: Array<string> = [];

		let ignoredFolders = this.settings.ignoredFolders
			.trim()
			.split(",")
			.map((str) => str.trim().replace(/^\/|\/$/g, ""))
			.filter((n) => n);

		Object.keys(allFiles).forEach((key) => {
			if (!ignoredFolders.some((path) => key.includes(path))) {
				//check if file is in an ignored folder
				if (currFilePath in allFiles[key]) {
					linkedMentions.push(key);
				}
			}
		});

		return linkedMentions.sort();
	}

	getTaggedMentions(tag: string) {
		const allFiles = this.app.metadataCache.resolvedLinks;
		let taggedMentions: Array<string> = [];
		const toCompare = tag.replace("#", "");

		let ignoredFolders = this.settings.ignoredFolders
			.trim()
			.split(",")
			.map((str) => str.trim().replace(/^\/|\/$/g, ""))
			.filter((n) => n);

		Object.keys(allFiles).forEach((key) => {
			//check if file is in an ignored folder
			if (!ignoredFolders.some((path) => key.includes(path))) {
				const file = this.app.vault.getAbstractFileByPath(key);
				if (file instanceof TFile) {
					const body_tags = app.metadataCache.getFileCache(file).tags;
					const frontmatter =
						this.app.metadataCache.getFileCache(file).frontmatter;

					if (body_tags) {
						for (const tag of body_tags) {
							if (tag["tag"].replace("#", "") === toCompare) {
								taggedMentions.push(file.path);
							}
						}
					}

					if (frontmatter) {
						let f_tags: Array<string> = [];
						if (Array.isArray(frontmatter["tags"])) {
							f_tags = frontmatter["tags"];

							for (const f_tag of f_tags) {
								if (f_tag === toCompare) {
									taggedMentions.push(file.path);
								}
							}
						}
						if (String.isString(frontmatter["tags"])) {
							f_tags = frontmatter["tags"].split(", ");

							for (const f_tag of f_tags) {
								if (f_tag === toCompare) {
									taggedMentions.push(file.path);
								}
							}
						}
					}
				}
			}
		});

		const uniqueTaggedMentions = taggedMentions.filter(
			(value, index, array) => array.indexOf(value) === index
		);

		return uniqueTaggedMentions;
	}

	getAliasMentions(refAlias: string) {
		const allFiles = this.app.metadataCache.resolvedLinks;
		let aliasMentions: Array<string> = [];

		let ignoredFolders = this.settings.ignoredFolders
			.trim()
			.split(",")
			.map((str) => str.trim().replace(/^\/|\/$/g, ""))
			.filter((n) => n);

		Object.keys(allFiles).forEach((key) => {
			//check if file is in an ignored folder
			if (!ignoredFolders.some((path) => key.includes(path))) {
				const file = this.app.vault.getAbstractFileByPath(key);
				if (file instanceof TFile) {
					const frontmatter =
						this.app.metadataCache.getFileCache(file).frontmatter;

					if (frontmatter) {
						let aliases: Array<string> = [];
						if (Array.isArray(frontmatter["aliases"])) {
							aliases = frontmatter["aliases"];

							for (const alias of aliases) {
								if (alias === refAlias) {
									aliasMentions.push(file.path);
								}
							}
						}
						if (String.isString(frontmatter["aliases"])) {
							aliases = frontmatter["aliases"].split(", ");

							for (const alias of aliases) {
								if (alias === refAlias) {
									aliasMentions.push(file.path);
								}
							}
						}
					}
				}
			}
		});

		const uniqueAliasMentions = aliasMentions.filter(
			(value, index, array) => array.indexOf(value) === index
		);

		return uniqueAliasMentions;
	}

	async addMissingLinks(
		activeFileView: MarkdownView,
		presentLinks: Array<string>,
		allLinkedMentions: Array<string>,
		item?: string
	) {
		let addFlag = false;

		// define list delimeters
		let listChar = "";
		let listIter = -1;
		let importPrefix = "";

		if (this.settings.importAsList === importListTypes.UnorderedList) {
			listChar = "*";
			importPrefix = listChar + " ";
		} else if (this.settings.importAsList === importListTypes.CheckBox) {
			listChar = "- [ ]";
			importPrefix = listChar + " ";
		} else if (this.settings.importAsList == importListTypes.OrderedList) {
			listChar = this.settings.orderedListSeparator;
			listIter = 1;
			importPrefix = listIter + listChar + " ";
		}

		//checks for missing links and adds them
		for (const path of allLinkedMentions) {
			if (!presentLinks.includes(path)) {
				const file = this.app.vault.getAbstractFileByPath(path);

				if (file instanceof TFile) {
					//check for aliases
					const frontmatter =
						this.app.metadataCache.getFileCache(file).frontmatter;
					let alias = "";

					if (
						this.settings.linkWithAlias &&
						frontmatter &&
						Array.isArray(frontmatter["aliases"]) &&
						frontmatter["aliases"].length > 0
					) {
						alias = frontmatter.aliases[0];
					}

					let closestHeading = "";
					let allHeadings: Array<string> = [];

					if (this.settings.linkToHeading) {
						const headingsLocations =
							await this.getHeadingsLocationsInFile(path);
						const linkTagLocations =
							await this.getItemLocationsInFile(
								activeFileView,
								path,
								item
							);
						for (let i = 0; i < linkTagLocations.length; i++) {
							closestHeading = this.determineClosestHeading(
								headingsLocations,
								linkTagLocations[i]
							);
							allHeadings.push(closestHeading);
						}
					}

					if (allHeadings.length > 0) {
						//if there is a closest heading, link to heading
						for (let i = 0; i < allHeadings.length; i++) {
							activeFileView.editor.replaceSelection(
								importPrefix +
									this.app.fileManager.generateMarkdownLink(
										file,
										activeFileView.file.path,
										"#" + allHeadings[i],
										alias
									) +
									"\n"
							);
						}
					} else {
						//otherwise just link to note without heading
						activeFileView.editor.replaceSelection(
							importPrefix +
								this.app.fileManager.generateMarkdownLink(
									file,
									activeFileView.file.path,
									undefined,
									alias
								) +
								"\n"
						);
					}
					if (
						this.settings.importAsList ===
						importListTypes.OrderedList
					) {
						listIter += 1;
						importPrefix = listIter + listChar + " ";
					}

					addFlag = true;
				}
			}
		}

		if (this.settings.newLinksAddedNotice && addFlag)
			new Notice("New links added to note");
		else if (this.settings.noNewLinksNotice && !addFlag)
			new Notice("No new links found");
	}

	async getHeadingsLocationsInFile(filePath: string) {
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (file instanceof TFile) {
			const fileContent = await this.app.vault.read(file);
			const lines = fileContent.split("\n");
			const regXHeader = /#{1,6}\s.+(?=)/g;
			let headings: Array<string> = [];

			lines.forEach((line) => {
				const match = line.match(regXHeader);
				if (match) headings.push(match[0].replace(/#{1,6}\s/g, ""));
				else headings.push("-1");
			});

			return headings;
		}
	}

	async getItemLocationsInFile(
		activeFileView: MarkdownView,
		filePath: string,
		item?: string
	) {
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (file instanceof TFile) {
			const fileContent = await this.app.vault.read(file);
			const lines = fileContent.split("\n");
			let lineContent: Array<string> = [];
			const activeFileName = activeFileView.file.name.substring(
				0,
				activeFileView.file.name.length - 3
			);

			let toSearch = "";
			if (!item) {
				toSearch = "[[" + activeFileName + "]]"; // -3 in order to remove ".md" from filepath
			} else toSearch = item;

			lines.forEach((line) => {
				if (line.includes(toSearch)) lineContent.push(toSearch);
				else lineContent.push("-1");
			});

			let toReturn: Array<number> = [];
			for (let i = 0; i < lineContent.length; i++) {
				if (lineContent[i] === toSearch) toReturn.push(i);
			}

			return toReturn;
		}
	}

	determineClosestHeading(
		headingsLocations: Array<string>,
		itemLocation: number
	) {
		let distances: Array<number> = [];

		headingsLocations.forEach((item, index) => {
			if (item != "-1") distances.push(Math.abs(index - itemLocation));
			else distances.push(-1);
		});

		let minIndex = -1;
		let minValue = Infinity;
		for (let i = 0; i < distances.length; i += 1) {
			if (distances[i] != -1) {
				if (distances[i] < minValue) {
					minIndex = i;
					minValue = distances[i];
				}
			}
		}

		if (minIndex === itemLocation) {
			headingsLocations[minIndex] = headingsLocations[minIndex]
				.replace(/#/g, "")
				.trim(); // need to explicitly remove all tags from name and trim trailing whitespaces
		}

		return headingsLocations[minIndex];
	}

	runAutoMOC(itemType: string, item?: string) {
		if (!Object.values<string>(itemTypes).includes(itemType)) {
			new Notice("Invalid itemType provided");
			return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (view != null && view.file.extension === "md") {
			if (this.settings.linkingMentionsNotice)
				new Notice("Linking mentions");

			const presentLinks = this.getPresentLinks(view.file.path); // links already in the document

			let linkTagMentions: Array<string>;
			if (itemType == itemTypes.Link) {
				linkTagMentions = this.getLinkedMentions(view.file.path); // all linked mentions even those not present
			} else if (itemType == itemTypes.Tag) {
				linkTagMentions = this.getTaggedMentions(item); // tagged mentions are looked up by basename rather than path
			} else if (itemType == itemTypes.Alias) {
				linkTagMentions = this.getAliasMentions(item); // alias mentions are looked up by basename rather than path
			}

			this.addMissingLinks(view, presentLinks, linkTagMentions, item);
		} else {
			new Notice(
				"Failed to link mentions, file type is not a markdown file"
			);
		}
	}

	async onload() {
		await this.loadSettings();

		if (this.settings.showRibbonButton) {
			const ribbonIconEl = this.addRibbonIcon(
				"sheets-in-box",
				"AutoMOC",
				(evt: MouseEvent) => {
					this.runAutoMOC(itemTypes.Link);
				}
			);
		}

		this.addCommand({
			id: "add-missing-linked-mentions",
			name: "Add missing linked mentions at the cursor position",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.runAutoMOC(itemTypes.Link);
			},
		});

		this.addCommand({
			id: "add-missing-notes-by-tag",
			name: "Add missing notes with a specific tag at the current cursor location",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new TagSuggestModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "add-missing-notes-by-alias",
			name: "Add missing notes with a specific alias at the current cursor location",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new AliasSuggestModal(this.app, this).open();
			},
		});

		this.addSettingTab(new AutoMOCSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class AutoMOCSettingTab extends PluginSettingTab {
	plugin: AutoMOC;

	constructor(app: App, plugin: AutoMOC) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		//Functionality Settings
		containerEl.createEl("h2", { text: "Functionality" });

		new Setting(containerEl)
			.setName("Show ribbon button")
			.setDesc(
				"Enable or disable the ribbon button for this plugin. You can still run the plugin with a hotkey (requires restart)"
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showRibbonButton)
					.onChange((showRibbonButton) => {
						this.plugin.settings.showRibbonButton =
							showRibbonButton;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Link to heading")
			.setDesc(
				"Creates the link to the heading closest to the link/tag. This is performed in a greedy manner"
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.linkToHeading)
					.onChange((linkToHeading) => {
						this.plugin.settings.linkToHeading = linkToHeading;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Create link with alias")
			.setDesc(
				"Creates the link with the first alias from the frontmatter"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.linkWithAlias)
					.onChange((linkWithAlias) => {
						this.plugin.settings.linkWithAlias = linkWithAlias;
						this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Import as list")
			.setDesc(
				"Choose whether to import the links directly or as a ordered/unordered list"
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption(importListTypes.Disabled, "Disabled")
					.addOption(importListTypes.OrderedList, "Ordered List")
					.addOption(importListTypes.UnorderedList, "Unordered List")
					.addOption(importListTypes.CheckBox, "Checkbox")
					.setValue(this.plugin.settings.importAsList)
					.onChange((importValue) => {
						this.plugin.settings.importAsList = importValue;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Ordered list separator character")
			.setDesc(
				'If "Import as List" is set to "Ordered List" - Set what character separates the number from the list item'
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption(orderedListDelimeters.Period, "Period")
					.addOption(orderedListDelimeters.Parenthesis, "Parenthesis")
					.setValue(this.plugin.settings.orderedListSeparator)
					.onChange((value) => {
						this.plugin.settings.orderedListSeparator = value;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Ignore notes in folders")
			.setDesc(
				"Specify a comma separated list of folders whose note's backlinks will not be added when AutoMOC is run \
				(start from the root of your vault)"
			)
			.addText((text) =>
				text
					.setPlaceholder("path1, path2, path 3...")
					.setValue(this.plugin.settings.ignoredFolders)
					.onChange(async (value) => {
						this.plugin.settings.ignoredFolders = value;
						await this.plugin.saveSettings();
					})
			);

		//Notification Settings
		containerEl.createEl("h2", { text: "Notifications" });

		new Setting(containerEl)
			.setName("Linking mentions")
			.setDesc(
				"Enable or disable notifications for when AutoMoc begins to run"
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.linkingMentionsNotice)
					.onChange((value) => {
						this.plugin.settings.linkingMentionsNotice = value;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("New links added")
			.setDesc(
				"Enable or disable notifications for when new links are added to a note"
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.newLinksAddedNotice)
					.onChange((value) => {
						this.plugin.settings.newLinksAddedNotice = value;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("No new links found")
			.setDesc(
				"Enable or disable notifications for when no new links are added to a note"
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.noNewLinksNotice)
					.onChange((value) => {
						this.plugin.settings.noNewLinksNotice = value;
						this.plugin.saveSettings();
					});
			});
	}
}

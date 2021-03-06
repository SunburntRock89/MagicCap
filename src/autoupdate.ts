// This code is a part of MagicCap which is a MPL-2.0 licensed project.
// Copyright (C) Jake Gealer <jake@gealer.email> 2018-2019.

import { AUTOUPDATE_ON } from "./build_info"
import { app, dialog } from "electron"
import { get } from "chainfetch"
import { exec } from "child_process"
// @ts-ignore
import * as sudo from "sudo-prompt"
import * as i18n from "./i18n"
import config from "./config"
import { promises } from "fs"
const { stat, writeFile } = promises

// Ignores this while the app is open.
const tempIgnore: string[] = []

// Defines if a update is running.
let updateRunning = false

/**
 * Checks if the autoupdate binaries are installed.
 * @returns Boolean saying whether the binary exists.
 */
async function checkAutoupdateBin() {
    try {
        await stat(`${require("os").homedir()}/magiccap-updater`)
        return true
    } catch (_) {
        return false
    }
}

/**
 * Downloads the needed autoupdate binaries.
 */
async function downloadBin() {
    const githubResp = await get(
        "https://api.github.com/repos/JakeMakesStuff/magiccap-updater/releases"
    ).toJSON()
    const latest = githubResp.body[0]
    let osPart
    switch (process.platform) {
        case "darwin":
            osPart = "mac"
            break
        case "linux":
            osPart = "linux"
    }
    for (const asset of latest.assets) {
        if (asset.name == `magiccap-updater-${osPart}`) {
            const updaterBuffer = await get(asset.browser_download_url).toBuffer()
            await writeFile(`${require("os").homedir()}/magiccap-updater`, updaterBuffer.body)
            await new Promise((res, rej) => exec(`chmod 777 "${require("os").homedir()}/magiccap-updater"`, (err, stdout) => {
                if (err) {
                    rej(err)
                    return
                }
                res(stdout)
            }))
            break
        }
    }
}

/**
 * Checks for any updates.
 * @returns A object repersenting if it is up to date and changelogs if it is not.
 */
async function checkForUpdates() {
    let res
    try {
        res = await get(`https://api.magiccap.me/version/check/${app.getVersion()}?beta=${Boolean(config.o.beta_channel).toString()}`).toJSON()
    } catch (_) {
        return {
            upToDate: true,
        }
    }
    if (res.status != 200) {
        return {
            upToDate: true,
        }
    }
    if (!res.body.success || res.body.updated) {
        return {
            upToDate: true,
        }
    }
    return {
        upToDate: false,
        current: res.body.latest.version,
        changelogs: res.body.changelogs,
    }
}

/**
 * Does the update.
 * @param {object} updateInfo - The object returned by checkForUpdates.
 */
async function doUpdate(updateInfo: any) {
    await new Promise(res => {
        sudo.exec(`"${require("os").homedir()}/magiccap-updater" v${updateInfo.current}`, {
            name: "MagicCap",
        }, (error: Error) => {
            if (error) {
                console.log(error)
                throw error
            }
            res()
        })
    })
}

/**
 * Handles a new update.
 * @param {object} updateInfo - A object containing the update information.
 */
async function handleUpdate(updateInfo: any) {
    if (tempIgnore.indexOf(updateInfo.current) > -1) {
        return
    }

    if (config.o.ignored_updates !== undefined) {
        if (config.o.ignored_updates.indexOf(updateInfo.current) > -1) {
            return
        }
    }

    const updateNowi18n = await i18n.getPoPhrase("Update Now", "autoupdate")
    const notNowi18n = await i18n.getPoPhrase("Not Now", "autoupdate")
    const skipi18n = await i18n.getPoPhrase("Skip Release", "autoupdate")
    const messagei18n = await i18n.getPoPhrase("A new version of MagicCap is available.", "autoupdate")
    const detaili18n = await i18n.getPoPhrase("You are on {current} and the latest is {latest}. Here are the changelogs since your current release:\n\n{changelogs}", "autoupdate")

    const { response } = await dialog.showMessageBox({
        type: "warning",
        buttons: [updateNowi18n, notNowi18n, skipi18n],
        title: "MagicCap",
        message: messagei18n,
        detail: detaili18n.replace("{current}", `v${app.getVersion()}`).replace("{latest}", `v${updateInfo.current}`).replace("{changelogs}", updateInfo.changelogs),
    })
    switch (response) {
        case 2:
            if (config.o.ignored_updates !== undefined) {
                config.o.ignored_updates.push(updateInfo.current)
            } else {
                config.o.ignored_updates = [updateInfo.current]
            }
            config.save()
            break
        case 1:
            tempIgnore.push(updateInfo.current)
            break
        case 0:
            updateRunning = true
            await doUpdate(updateInfo)
            updateRunning = false
    }
}

/**
 * Handles the initial HTTP update check.
 */
async function runHttpUpdateCheck(ignoreConfig: boolean) {
    console.log("Running HTTP update check.")
    if (updateRunning || (!ignoreConfig && config.o.autoupdate_on === false)) {
        return
    }
    const updateInfo = await checkForUpdates()
    if (!updateInfo.upToDate) {
        updateRunning = true
        await handleUpdate(updateInfo)
        updateRunning = false
    }
    return updateInfo.upToDate
}

/**
 * The loop which automatically checks for updates.
 */
export default async function autoUpdateLoop() {
    if (!AUTOUPDATE_ON) {
        return
    }

    if (config.o.autoupdate_on === false) {
        // We want undefined to fall through here.
        return
    }

    const binExists = await checkAutoupdateBin()
    if (!binExists) {
        let toContinue = await new Promise(async res => {
            const yesi18n = await i18n.getPoPhrase("Yes", "autoupdate")
            const noi18n = await i18n.getPoPhrase("No", "autoupdate")
            const dontAski18n = await i18n.getPoPhrase("Don't ask again", "autoupdate")
            const messagei18n = await i18n.getPoPhrase("In order for autoupdate to work, MagicCap has to install some autoupdate binaries. Shall I do that? MagicCap will not autoupdate without this.", "autoupdate")
            const { response } = await dialog.showMessageBox({
                type: "warning",
                buttons: [yesi18n, noi18n, dontAski18n],
                title: "MagicCap",
                message: messagei18n,
            })
            let toCont = true
            switch (response) {
                case 2:
                    toCont = false
                    config.o.autoupdate_on = false
                    config.save()
                    break
                case 1:
                    toCont = false
                    break
                case 0:
                    await downloadBin()
                    break
            }
            res(toCont)
        })
        if (!toContinue) {
            return
        }
    }

    if (config.o.autoupdate_on === false) {
        return
    }

    runHttpUpdateCheck(false)
    setInterval(() => runHttpUpdateCheck(false), 600000)
}

/**
 * Manually checks for updates.
 */
async function manualCheck() {
    if (!AUTOUPDATE_ON) {
        return
    }
    const binExists = await checkAutoupdateBin()
    if (!binExists) {
        const cont = await new Promise(async res => {
            const yesi18n = await i18n.getPoPhrase("Yes", "autoupdate")
            const noi18n = await i18n.getPoPhrase("No", "autoupdate")
            const messagei18n = await i18n.getPoPhrase("In order for autoupdate to work, MagicCap has to install some autoupdate binaries. Shall I do that? MagicCap will not autoupdate without this.", "autoupdate")
            const { response } = await dialog.showMessageBox({
                type: "warning",
                buttons: [yesi18n, noi18n],
                title: "MagicCap",
                message: messagei18n,
            })
            let toCont = true
            switch (response) {
                case 1:
                    toCont = false
                    break
                case 0:
                    await downloadBin()
                    break
            }
            res(toCont)
        })
        if (!cont) {
            return
        }
    }

    if (await runHttpUpdateCheck(true)) {
        // Show the up to date message.
        await dialog.showMessageBox({
            type: "info",
            title: "MagicCap",
            message: "Update Check",
            detail: "There are currently no updates for your version.",
        })
    }
}
autoUpdateLoop.manualCheck = manualCheck

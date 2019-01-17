const fetch = require('node-fetch')
const functions = require('firebase-functions')
const { db, functionsUrl, collection, url_for, getConfig } = require('../utils')

const CRONJOB_KEY = getConfig('cronjob_key')
const ADMIN_TOKEN = getConfig('admin_token')

/**
 * List of Cronjobs:
 *
 *   - pullData: every 15 or 30 minutes
 *   - updateInfo: daily
 *   - removeUnsubscriberUrl10: daily
 */

module.exports = functions.https.onRequest((req, res) => {
    let validTask = ['pullData', 'updateInfo']
    let task = req.query.task || 'pullData'

    if (!task || validTask.indexOf(task) == -1) {
        return res.status(400).json({
            err: 1,
            msg: 'Invalid cronjob task'
        })
    }

    console.log(`Start cronjob task ${task} ...`)

    let triggered = []
    if (CRONJOB_KEY) {
        if (!req.query.key || req.query.key !== CRONJOB_KEY) {
            return res.status(400).json({ error: 1, msg: 'Cronjob key is not valid: /cronjob?key=<CRONJOB_KEY>' })
        }
    }

    db.collection(collection.URLS).get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                let url = doc.get('url')

                // Fix: remove wrong collection snapshot
                if (!url) {
                    console.log(`Document ${doc.id} may be wrong ${doc.data()}, delete it`)
                    doc.ref.delete()
                    return
                }

                let trigger_url = url_for(task, { url, token: ADMIN_TOKEN })

                console.log(`Query for ${url}`)
                console.log(`Trigger ${trigger_url}`)

                // Start fetch() to trigger
                fetch(trigger_url)
                triggered.push(url)
            })

            // Update counter in Metadata
            let cronjobLogs = db.collection(collection.METADATA)
                                .doc('statistics')
                                .collection(collection.CRONJOB_LOGS)
            cronjobLogs.add({
                num_triggered: triggered.length,
                triggered,
                task
            }).then(doc => {
                // Update cronjob counter
                let statisticDoc = db.collection(collection.METADATA).doc('statistics')
                statisticDoc.get().then(doc => {
                    const num_url_cronjob_triggered = parseInt(doc.get('num_url_cronjob_triggered') || 0) + triggered.length;
                    statisticDoc.set({num_url_cronjob_triggered}, { merge: true })
                })
            })

            return res.json({ task, triggered, triggered_at: new Date() })
        })
        .catch(err => {
            console.log('The read failed: ', err)
            return res.status(500).json({
                error: 1,
                err
            })
        })
})
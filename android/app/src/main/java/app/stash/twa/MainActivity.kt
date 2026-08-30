package app.stash.twa

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.browser.customtabs.CustomTabsIntent

class MainActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val url = if (intent.action == Intent.ACTION_SEND && intent.type?.startsWith("text/") == true) {
            val text = intent.getStringExtra(Intent.EXTRA_TEXT)
            val title = intent.getStringExtra(Intent.EXTRA_SUBJECT)
            val sharedUrl = extractUrl(text)
            buildSaveUri(sharedUrl, text, title)
        } else {
            Uri.parse(BuildConfig.STASH_URL)
        }

        val tabsIntent = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .build()
        tabsIntent.launchUrl(this, url)
        finish()
    }

    private fun buildSaveUri(url: String?, text: String?, title: String?): Uri {
        val builder = Uri.parse(BuildConfig.STASH_URL).buildUpon()
            .appendPath("save")
        if (!url.isNullOrBlank()) builder.appendQueryParameter("url", url)
        if (!text.isNullOrBlank()) builder.appendQueryParameter("text", text)
        if (!title.isNullOrBlank()) builder.appendQueryParameter("title", title)
        return builder.build()
    }

    private fun extractUrl(text: String?): String? {
        if (text.isNullOrBlank()) return null
        val match = Regex("""https?://\S+""").find(text)
        return match?.value?.trimEnd('.', ',', ')', ']', '>', ';', '!', '?')
    }
}
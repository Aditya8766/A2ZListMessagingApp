package expo.modules.financesms

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.provider.Telephony
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

@Suppress("DEPRECATION")
private fun sendWithResult(context: Context, manager: SmsManager, number: String, body: String, promise: Promise) {
  val parts = manager.divideMessage(body)
  val action = "${context.packageName}.SMS_SENT.${UUID.randomUUID()}"
  val callbacks = parts.indices.mapTo(ArrayList()) { index ->
    val intent = Intent(action).setPackage(context.packageName).putExtra("part", index)
    PendingIntent.getBroadcast(context, index, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT)
  }
  val handler = Handler(Looper.getMainLooper())
  var finished = false
  var registered = false
  var remaining = parts.size
  var failure: String? = null
  val completed = BooleanArray(parts.size)
  lateinit var receiver: BroadcastReceiver
  lateinit var timeout: Runnable

  fun finish(error: String?, confirmed: Boolean) {
    if (finished) return
    finished = true
    handler.removeCallbacks(timeout)
    if (registered) context.unregisterReceiver(receiver)
    callbacks.forEach { it.cancel() }
    if (error == null) promise.resolve(confirmed)
    else promise.reject("ERR_SMS_SEND", error, null)
  }

  receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val index = intent.getIntExtra("part", -1)
      if (index !in completed.indices || completed[index]) return
      completed[index] = true
      if (resultCode != Activity.RESULT_OK && failure == null) {
        failure = when (resultCode) {
          SmsManager.RESULT_ERROR_NO_SERVICE -> "Your SIM has no SMS service. Check your mobile signal and plan."
          SmsManager.RESULT_ERROR_RADIO_OFF -> "Turn off airplane mode or enable your SIM."
          SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> "Android or your carrier limited SMS sending. Try again later."
          else -> "Android reported an SMS send error (code $resultCode). Check your SIM and carrier service."
        }
      }
      if (--remaining == 0) finish(failure, confirmed = true)
    }
  }
  timeout = Runnable { finish(failure, confirmed = false) }
  try {
    val filter = IntentFilter(action)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
    registered = true
    handler.postDelayed(timeout, 45_000)
    if (parts.size == 1) manager.sendTextMessage(number, null, body, callbacks[0], null)
    else manager.sendMultipartTextMessage(number, null, parts, callbacks, null)
  } catch (error: Exception) {
    finish(error.message ?: "Android could not start sending the SMS.", confirmed = false)
  }
}

private object Queue {
  @Synchronized fun read(context: Context): JSONArray = JSONArray(context.getSharedPreferences("finance_sms", Context.MODE_PRIVATE).getString("queue", "[]"))
  @Synchronized fun write(context: Context, data: JSONArray) { context.getSharedPreferences("finance_sms", Context.MODE_PRIVATE).edit().putString("queue", data.toString()).commit() }
  @Synchronized fun add(context: Context, item: JSONObject) {
    val data = read(context)
    for (i in 0 until data.length()) if (data.getJSONObject(i).getString("id") == item.getString("id")) return
    data.put(item)
    write(context, data)
  }
}

class FinanceSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    if (!context.getSharedPreferences("finance_sms", Context.MODE_PRIVATE).getBoolean("enabled", false)) return
    if (context.checkSelfPermission(Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) return
    val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    if (parts.isEmpty()) return
    val body = parts.joinToString("") { it.messageBody ?: "" }
    // Discard unrelated messages and OTPs before any persistence.
    if (Regex("\\b(otp|one[ -]time password|verification code|offer|pre-approved)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return
    if (!Regex("\\b(upi|account|a/c|acct|bank|neft|imps|atm|txn|transaction)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return
    if (!Regex("\\b(debited|credited|paid|received|withdrawn|withdrawal|refund|refunded|reversed|reversal|failed|declined|pending|processing|completed|successful|successfully)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return
    if (!Regex("(?:INR|Rs\\.?|₹)\\s*[\\d,]+", RegexOption.IGNORE_CASE).containsMatchIn(body)) return
    val sender = parts.first().originatingAddress ?: "Unknown"
    val timestamp = parts.first().timestampMillis
    val digest = MessageDigest.getInstance("SHA-256").digest("$sender|$timestamp|$body".toByteArray()).joinToString("") { "%02x".format(it) }
    Queue.add(context, JSONObject().put("id", digest).put("sender", sender).put("body", body).put("timestamp", timestamp))
  }
}

class FinanceSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FinanceSms")
    Constant("available") { true }
    Function("enabled") { context().getSharedPreferences("finance_sms", Context.MODE_PRIVATE).getBoolean("enabled", false) }
    Function("setEnabled") { value: Boolean ->
      val ctx = context()
      require(!value || ctx.checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED) { "SMS permission is required" }
      ctx.getSharedPreferences("finance_sms", Context.MODE_PRIVATE).edit().putBoolean("enabled", value).commit()
    }
    Function("pending") {
      val data = Queue.read(context())
      (0 until data.length()).map { index ->
        val item = data.getJSONObject(index)
        mapOf("id" to item.getString("id"), "sender" to item.getString("sender"), "body" to item.getString("body"), "timestamp" to item.getLong("timestamp"))
      }
    }
    Function("acknowledge") { ids: List<String> ->
      val ctx = context()
      synchronized(Queue) {
        val data = Queue.read(ctx)
        val remaining = JSONArray()
        for (i in 0 until data.length()) if (!ids.contains(data.getJSONObject(i).getString("id"))) remaining.put(data.getJSONObject(i))
        Queue.write(ctx, remaining)
      }
    }
    Function("clear") { Queue.write(context(), JSONArray()) }
    AsyncFunction("readDeviceSms") { beforeId: String? ->
      val ctx = context()
      require(ctx.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED) {
        "SMS read permission is required."
      }
      val columns = arrayOf("_id", "address", "body", "date", "type")
      val messages = mutableListOf<Map<String, Any>>()
      val cursor = ctx.contentResolver.query(
        Telephony.Sms.CONTENT_URI,
        columns,
        if (beforeId == null) null else "_id < ?",
        beforeId?.let { arrayOf(it) },
        "_id DESC"
      )
      requireNotNull(cursor) { "Android could not open the SMS store." }.use {
        while (messages.size < 50 && it.moveToNext()) {
          messages.add(mapOf(
            "id" to it.getString(0),
            "address" to (it.getString(1) ?: "Unknown"),
            "body" to (it.getString(2) ?: ""),
            "timestamp" to it.getLong(3),
            "type" to it.getInt(4)
          ))
        }
      }
      messages
    }
    @Suppress("DEPRECATION")
    AsyncFunction("sendDeviceSms") { number: String, body: String, promise: Promise ->
      val ctx = context()
      require(ctx.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED) {
        "SMS send permission is required."
      }
      require(Regex("^\\+?[0-9]{7,15}$").matches(number)) { "Enter a valid phone number." }
      require(body.isNotBlank() && body.length <= 1600) { "Enter a message of up to 1,600 characters." }
      val subscription = SubscriptionManager.getDefaultSmsSubscriptionId()
      require(subscription != SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
        "Select an active SIM as the default for SMS in Android Settings."
      }
      val manager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        requireNotNull(ctx.getSystemService(SmsManager::class.java)) {
          "SMS service is unavailable on this device."
        }.createForSubscriptionId(subscription)
      } else {
        SmsManager.getSmsManagerForSubscriptionId(subscription)
      }
      sendWithResult(ctx.applicationContext, manager, number, body, promise)
    }.runOnQueue(Queues.MAIN)
  }
  private fun context(): Context = requireNotNull(appContext.reactContext)
}

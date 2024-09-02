import RuntimeClientFactory, { Context as VFContext, TraceType } from '@voiceflow/runtime-client-js';
import { MessageFactory, TeamsActivityHandler } from 'botbuilder';
import kvstore from './store';
import { TurnContext } from 'botbuilder-core';
import * as dotenv from 'dotenv';
// import sharp from 'sharp';
import axios from 'axios';

async function logImageSize(imageUrl: string): Promise<void> {
  try {
    const response = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'stream'
    });

    let imageSize = 0;

    response.data.on('data', (chunk: Buffer) => {
      imageSize += chunk.length;
    });

    response.data.on('end', () => {
      console.log(`Image Size: ${imageSize} bytes`);
    });
  } catch (error) {
    console.error('Error fetching image:', error);
  }
}


class VoiceflowBot extends  TeamsActivityHandler {
  private factory: RuntimeClientFactory;

  getClient = async (ctx: TurnContext) => {
    const senderID = ctx.activity!.id!.toString();
    console.log(`Retrieving state for sender ID: ${senderID}`);
    const state = await kvstore.get(senderID);
    console.log(`State for sender ID ${senderID}:`, state);


    const vfClient = this.factory.createClient(state);
    console.log(`Initializing Voiceflow conversation for sender ID: ${senderID}`);
    
    try {
      const startContext = await vfClient.start();
      console.log(`Voiceflow startContext for sender ID ${senderID}:`, JSON.stringify(startContext, null, 2));
    } catch (error) {
      console.error(`Error initializing Voiceflow conversation for sender ID ${senderID}:`, error);
    }
    
   // if (startContext) {
 //     console.log(`Received response from Voiceflow:`, JSON.stringify(startContext.getTrace(), null, 2));
 //     await this.response(ctx, startContext);
 //   } else {
 //     console.log('Unexpected startContext structure:', JSON.stringify(startContext, null, 2));
  //  }
    
    return vfClient;
  };

  
  
  response = async (ctx: TurnContext, VFctx: VFContext) => {
    const senderID = ctx.activity!.id!.toString();
    console.log(`Saving state for sender ID: ${senderID}`);
    await kvstore.set(senderID, VFctx.toJSON().state);
    const traces = VFctx.getTrace();
    if (!traces) {
      console.warn(`No traces found for context, sender ID: ${senderID}`);
      return;
    }

    for (const trace of VFctx.getTrace()) {
      console.log(`Processing trace of type: ${trace.type}`);
      if (trace.type === TraceType.SPEAK || (trace.type as string) === 'text') {
        console.log(`Sending text response:`, trace.payload.message);
        await ctx.sendActivity(MessageFactory.text(trace.payload.message));
      }
      if (trace.type === TraceType.VISUAL && trace.payload.visualType === 'image') {
        let imageUrl = trace.payload.image!;
        // Ensure the URL uses HTTPS
        imageUrl = imageUrl.replace(/^http:/, 'https:');
        console.log(`Sending image response:`, imageUrl);
        await logImageSize(imageUrl); // Log the size before sending
        await ctx.sendActivity(MessageFactory.contentUrl(imageUrl, 'image/png'));
      }
    }
  };
  

  constructor() {
    super();
    dotenv.config();
    this.factory = new RuntimeClientFactory({
      versionID: process.env.VOICEFLOW_VERSION_ID!, // voiceflow project versionID
      apiKey: process.env.VOICEFLOW_API_KEY!, // voiceflow api key
      endpoint: process.env.VOICEFLOW_RUNTIME_ENDPOINT,
    });


    

      
    //Seems like I have duplicated Code will need to clean this up 

     // Listen for members added to the conversation
     // Enhanced logging for members added to the conversation
     this.onMembersAdded(async (context: TurnContext) => {
      console.log("onMembersAdded triggered");
      const membersAdded = context.activity.membersAdded;
      console.log(`Members added: ${JSON.stringify(membersAdded)}`);
      
      if (membersAdded?.some(member => member.id !== context.activity.recipient.id)) {
        console.log(`New member added to the conversation that is not the bot.`);
        const welcomeText = "Hi! I'm Emma, your company's internal sales assistant. How can I help you today?";
        //Hi! I'm Emma, your company's internal sales assistant. How can I help you today?
        await context.sendActivity(MessageFactory.text(welcomeText));
        console.log("Welcome message sent.");
      } else {
        console.log("No new members added or only the bot was added.");
      }
    });

  



    // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
    this.onMessage(async (ctx: TurnContext, next) => {
      console.log(ctx);
      console.log('Received context:', JSON.stringify(ctx, null, 2));
      console.log(`Received message from user: ${ctx.activity.text}`);
      
      
      console.log("V2")

      try {
        const client = await this.getClient(ctx);
        console.log(`Sending message to Voiceflow: ${ctx.activity.text}`);
        const context = await client.sendText(ctx.activity.text);
        console.log(`Received response from Voiceflow:`, JSON.stringify(context.getTrace(), null, 2));
        await this.response(ctx, context);
      } catch (error) {
        console.error('Error during message processing and response:', error);
        await ctx.sendActivity('Sorry, something went wrong while processing your message.');
      }
     // await this.response(ctx, context);
     
      // By calling next(sss) you ensure that the next BotHandler is run.
      // eslint-disable-next-line callback-return
      await next();
    });
  }
}




// Create the main dialog.
const VoiceflowBotClient = new VoiceflowBot();

export default VoiceflowBotClient;
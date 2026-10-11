/** Wallet errors in plain language; EIP-1193 codes first, then common provider wording. */
export function walletErrorText(error:unknown){const code=(error as {code?:number}|null)?.code??(error as {cause?:{code?:number}}|null)?.cause?.code,text=error instanceof Error?error.message:String(error);
 if(code===4001||/user (?:rejected|denied)|rejected the request/i.test(text))return 'You declined the request in your wallet. Nothing was signed or sent. You can try again when ready.';
 if(code===-32002)return 'Your wallet already has a request waiting. Open the wallet window to finish or dismiss it.';
 if(code===4100)return 'Unlock your wallet and allow this page to connect, then try again.';
 if(code===4902)return 'This network is not added to your wallet yet.';
 return text||'The wallet action was not completed.';}

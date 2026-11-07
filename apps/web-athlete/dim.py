data=open('public/pwa.jpg','rb').read(); i=0
while i < len(data):
    if data[i]==0xFF:
        marker=data[i+1]
        if marker in (0xC0,0xC1,0xC2):
            h=int.from_bytes(data[i+5:i+7],'big')
            w=int.from_bytes(data[i+7:i+9],'big')
            print('dimensions', w, 'x', h)
            break
        i+=2
    else:
        i+=1

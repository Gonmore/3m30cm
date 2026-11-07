data=open('public/Logo_Blanco.png','rb').read(); import struct; w,h=struct.unpack('>II', data[16:24]); print('Logo_Blanco', w, 'x', h)

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% S-curve motion sample program
%% by Keunho Rew 20180521
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
clear all; close all; clc;

%% parameters
betta = 0.5;  % smoothness (0,1]
gamma = 0.1; % asymetricity (0,inf)
dt = 1e-2; % msec
Vmax = 50; % degree/ms^2
Amax = 10; % degree/ms^2
% delta = 360; % degree
delta = 1000; % degree
fname = 'ascurve.txt'; % file name for output

%% calculation
deltaShort = (1+gamma)*betta^2*Vmax^2/Amax;
deltaLong = (1+gamma)*(1+betta)/2*Vmax^2/Amax;
tjs = betta*Vmax/Amax;
tas = (1-betta)*Vmax/Amax;

%% delta case
if delta <= deltaShort
    dcase = 'short';
    tv = 0; 
    ta = 0;
    tj = (tjs/(1+gamma)/Amax*delta)^(1/3);
elseif delta >= deltaLong
    dcase = 'long';
    tj = tjs;
    ta = tas;       %fixed, changed 37_line
    tv = (delta - deltaLong)/Vmax;
else
    dcase = 'medium';
    tj = tjs;
    ta = -1.5*betta*Vmax/Amax + sqrt((betta*Vmax/Amax/2)^2 + (2*delta/Amax/(1+gamma)));  %fixed, changed 32_line
    tv = 0;
end

Jerk = (Amax^2)/(betta*Vmax);

%% time & memory allocation
t1 = tj; t2 = t1 + ta; t3 = t2 + tj;
t4 = t3 + tv;
t5 = t4 + gamma*tj; t6 = t5 + gamma*ta; t7 = t6 + gamma*tj;

len = round((t7 + 1)/dt);
tt = dt.*[1:len]';
jerk = zeros(len,1); acc = zeros(len,1); vel = zeros(len,1); pos = zeros(len,1);

%% loop
kk = 1;
while (kk <= (len-1))
if tt(kk) <= t1
    jerk(kk+1) = Jerk;
    acc(kk+1) = acc(kk) + jerk(kk+1)*dt; 
    vel(kk+1) = vel(kk) + acc(kk+1)*dt; 
    pos(kk+1) = pos(kk) + vel(kk+1)*dt;    
elseif tt(kk) <= t2
    jerk(kk+1) = 0;
    acc(kk+1) = acc(kk); 
    vel(kk+1) = vel(kk) + acc(kk+1)*dt; 
    pos(kk+1) = pos(kk) + vel(kk+1)*dt;    
elseif tt(kk) <= t3
    jerk(kk+1) = -Jerk;
    acc(kk+1) = acc(kk) + jerk(kk+1)*dt; 
    vel(kk+1) = vel(kk) + acc(kk+1)*dt; 
    pos(kk+1) = pos(kk) + vel(kk+1)*dt;    
elseif tt(kk) <= t4
    jerk(kk+1) = 0;
    acc(kk+1) = acc(kk); 
    vel(kk+1) = vel(kk); 
    pos(kk+1) = pos(kk) + vel(kk)*dt;    
elseif tt(kk) <= t5
    jerk(kk+1) = -Jerk/gamma^2;
    acc(kk+1) = acc(kk) + jerk(kk+1)*dt;
    vel(kk+1) = vel(kk) + acc(kk+1)*dt; 
    pos(kk+1) = pos(kk) + vel(kk+1)*dt;    
elseif tt(kk) <= t6
    jerk(kk) = 0;
    acc(kk+1) = acc(kk); 
    vel(kk+1) = vel(kk) + acc(kk+1)*dt; 
    pos(kk+1) = pos(kk) + vel(kk+1)*dt;    
elseif tt(kk) <= t7
    jerk(kk+1) = Jerk/gamma^2;
    acc(kk+1) = acc(kk) + jerk(kk+1)*dt; 
    vel(kk+1) = vel(kk) + acc(kk+1)*dt; 
    pos(kk+1) = pos(kk) + vel(kk+1)*dt;    
else                    % t8
    jerk(kk+1) = 0;
    acc(kk+1) = acc(kk); 
    vel(kk+1) = vel(kk); 
    pos(kk+1) = pos(kk);    
end
    kk = kk + 1;
end

%% plot results
V1 = ones(len,1);

figure(1);
subplot(411); plot(tt,jerk,tt,Jerk.*V1,'r:',tt,-Jerk.*V1,'r:'); grid on; 
    ylabel('Jerk [deg/ms^3]');
subplot(412); plot(tt,acc,tt,Amax.*V1,'r:',tt,-Amax.*V1,'r:'); grid on; 
    ylabel('Acc [deg/ms^2]');
subplot(413); plot(tt,vel,tt,Vmax.*V1,'r:'); grid on; 
    ylabel('Vel [deg/ms]');
subplot(414); plot(tt,pos); grid on; 
    ylabel('Pos [deg]'); xlabel('Time [msec]');

%% print results
    s1 = 'dt=%.2f, t1=%.2f, t2=%.2f, t3=%.2f, t4=%.2f, t5=%.2f, t6=%.2f, t7=%.2f'; 
sprintf(s1,dt,t1,t2,t3,t4,t5,t6,t7)
    s2 = 'delta=%.2f, Amax=%.2f, Vmax=%.2f, betta=%.2f, gamma=%.2f';
sprintf(s2,delta,Amax,Vmax,betta,gamma)

    s3 = '%.2f %.2f %.2f %.2f %.2f \r\n';
fid = fopen(fname,'w');
for kk = 1:len
    fprintf(fid,s3,tt(kk),jerk(kk),acc(kk),vel(kk),pos(kk));
end

fclose(fid);

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% end
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%